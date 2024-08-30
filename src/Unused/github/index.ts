import { Octokit } from "@octokit/rest";
import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import fs from "fs";
import path from "path";
import { command_on_system, run_command } from "../../exec";
import { collectFilePathsIn } from "../../fs";
import { delete_file_from_repo, deleteBranchOnFailure, forceUploadFileToRepo, get_token_for_repo, list_files_in_repo, repo_name_to_api_link } from "../../github";
import logger, { loadingSpinner } from "../../logger";




// Helper to read directory contents recursively
export async function readDirectoryRecursive(dirPath: string) {
    const files = [] as string[];
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files.push(...(await readDirectoryRecursive(fullPath)));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

// Create a new branch
async function create_branch(org: string, repo: string, branch: string, base_branch: string, token: string) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/refs`;
    const base_branchRef = await axios.get(`${url}/heads/${base_branch}`, {
        headers: { Authorization: `token ${token}` },
    });

    const response = await axios.post(
        url,
        {
            ref: `refs/heads/${branch}`,
            sha: base_branchRef.data.object.sha,
        },
        { headers: { Authorization: `token ${token}` } },
    );

    return response.data.object.sha;
}

// Create a blob for each file
async function create_blob(org: string, repo: string, file_path: string, token: string) {
    try {
        const content = fs.readFileSync(file_path);
        const base64Content = content.toString("base64");

        const url = `https://api.github.com/repos/${org}/${repo}/git/blobs`;
        const response = await axios.post(
            url,
            {
                content: base64Content,
                encoding: "base64",
            },
            { headers: { Authorization: `token ${token}` } },
        );

        return response.data.sha;
    } catch (error: any) {
        logger.log("blob error", error.message);
        throw error;
    }
}

// Create a tree object
async function create_tree(org: string, repo: string, files: string[], directory_path: string, token: string) {
    const tree = await Promise.all(
        files.map(async file_path => {
            const fileSha = await create_blob(org, repo, file_path, token);
            const relativePath = path.relative(directory_path, file_path).replace(/\\/g, "/");
            logger.log("created_blob blob", {
                relativePath,
                fileSha,
            });
            return {
                path: relativePath,
                mode: "100644",
                type: "blob",
                sha: fileSha,
            };
        }),
    );

    const url = `https://api.github.com/repos/${org}/${repo}/git/trees`;
    const response = await axios.post(
        url,
        {
            tree,
        },
        { headers: { Authorization: `token ${token}` } },
    );

    return response.data.sha;
}

// Check if the repository is empty
async function is_repo_empty(org: string, repo: string, token: string) {
    try {
        await axios.get(`https://api.github.com/repos/${org}/${repo}/git/refs/heads/main`, {
            headers: { Authorization: `token ${token}` },
        });
        return false;
    } catch (error: any) {
        if (error.response && (error.response.status === 404 || error.response.status === 409)) {
            return true; // No branches found, repository is empty
        }
        throw error;
    }
}

async function setup_empty_repo(org_name: string, repo_name: string, branch: string, token: string) {
    async function initializeRepo(orgName: string, repoName: string, branchName: string, token: string) {
        const octokit = new Octokit({ auth: token });

        // The file to add to the initial commit
        const filePath = "README.md";
        const fileContent = "# Initial Commit\nThis is the initial commit.";

        // Convert content to Base64
        const contentEncoded = Buffer.from(fileContent).toString("base64");

        try {
            // Step 1: Create a blob with the file content
            const { data: blobData } = await octokit.git.createBlob({
                owner: orgName,
                repo: repoName,
                content: contentEncoded,
                encoding: "base64",
            });

            logger.log(`Blob created with SHA: ${blobData.sha}`);

            // Step 2: Create a tree containing the blob
            const { data: treeData } = await octokit.git.createTree({
                owner: orgName,
                repo: repoName,
                tree: [
                    {
                        path: path.basename(filePath),
                        mode: "100644",
                        type: "blob",
                        sha: blobData.sha,
                    },
                ],
            });

            logger.log(`Tree created with SHA: ${treeData.sha}`);

            // Step 3: Create a commit with the tree
            const { data: commitData } = await octokit.git.createCommit({
                owner: orgName,
                repo: repoName,
                message: "Initial commit",
                tree: treeData.sha,
                parents: [], // No parent since it's the initial commit
            });

            logger.log(`Commit created with SHA: ${commitData.sha}`);

            // Step 4: Create the branch reference pointing to the new commit
            await octokit.git.createRef({
                owner: orgName,
                repo: repoName,
                ref: `refs/heads/${branchName}`,
                sha: commitData.sha,
            });

            logger.log(`Branch ${branchName} created with initial commit.`);
        } catch (error: any) {
            throw error;
        }
    }
    await initializeRepo(org_name, repo_name, branch, token);
}

// Create a commit object
async function create_commit(
    org: string,
    repo: string,
    tree_sha: string | undefined,
    parent_sha: string | undefined,
    commit_message: string,
    token: string,
) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/commits`;
    const data = {
        message: commit_message,
        tree: tree_sha,
    } as any;

    if (parent_sha) {
        data.parents = [parent_sha];
    }

    const response = await axios.post(url, data, { headers: { Authorization: `token ${token}` } });

    return response.data.sha;
}

// Update branch to point to the new commit
async function update_branch(org: string, repo: string, branch: string, commit_sha: string, token: string) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/refs/heads/${branch}`;
    await axios.patch(url, { sha: commit_sha, force: true }, { headers: { Authorization: `token ${token}` } });
}
async function create_branch_for_initial_push(
    org: string,
    repo: string,
    branch: string,
    commit_sha: string,
    token: string,
) {
    const url = `https://api.github.com/repos/${org}/${repo}/git/refs`;
    const response = await axios.post(
        url,
        {
            ref: `refs/heads/${branch}`,
            sha: commit_sha,
        },
        { headers: { Authorization: `token ${token}` } },
    );

    return response.data.object.sha;
}
// Main function to upload directory as a single commit
export async function upload_directory(
    org: string,
    repo: string,
    branch: string,
    base_branch: string | undefined,
    directory_path: string,
    token: string,
) {
    try {
        const repo_empty = await is_repo_empty(org, repo, token);
        if (repo_empty) {
            await setup_empty_repo(org, repo, branch, token);
        }
        logger.log("repos is empty", repo_empty);
        let base_sha: string | undefined = undefined;
        if (!repo_empty && base_branch) {
            // If the repo is not empty, create a branch or reset it
            base_sha = await create_branch(org, repo, branch, base_branch, token);
        }
        // Get all files in the directory
        const files = await readDirectoryRecursive(directory_path);

        // Create a tree object with all files
        const treeSha = await create_tree(org, repo, files, directory_path, token);

        // Create a commit that points to the tree
        const commit_sha = await create_commit(
            org,
            repo,
            treeSha,
            base_sha,
            `Add ${path.basename(directory_path)} contents`,
            token,
        );
        if (repo_empty) {
            logger.log("repo is empty");
            // If the repository is empty, create the initial branch
            await create_branch_for_initial_push(org, repo, branch, commit_sha, token);
        } else {
            // If the repository is not empty, force update the branch to point to the new commit
            await update_branch(org, repo, branch, commit_sha, token);
        }

        logger.log("Directory uploaded successfully as a single commit");
    } catch (error: any) {
        logger.error("Error during upload:", error.message, JSON.stringify(error, null, 4));
        throw new Error("Upload failed");
    }
}

export async function upload_directory_to_repo(
    owner: string,
    repo: string,
    localDir: string,
    branch: string,
    repoPath = "",
) {
    try {
        const filesToUpload: string[] = [];

        const files = await collectFilePathsIn(localDir);
        logger.log("going to upload files", files);
        let promises = [] as any[];
        for (const file of files) {
            const repoItemPath = file.slice(localDir.length + 1).replace(/\\/g, "/"); // Ensure repo path is Unix-style
            logger.log("uploading file", {
                file,
                localDir,
                owner,
                repo,
                repoItemPath,
            });
            const fileContent = fs.readFileSync(file, { encoding: "base64" });
            const promise = await forceUploadFileToRepo(owner, repo, file, fileContent, branch);
            promises.push(promise);
            if (promises.length > 6) {
                await Promise.all(promises.splice(0));
            }
        }

        const existingFiles = await list_files_in_repo(owner, repo, branch, repoPath);
        const filesToDelete = existingFiles.filter(file => !filesToUpload.includes(file));
        logger.log("files to delete", filesToDelete);
        const deletePromises = filesToDelete.map(file => delete_file_from_repo(owner, repo, file, branch));
        await Promise.all(deletePromises);
    } catch (error) {
        await deleteBranchOnFailure(owner, repo, branch);
        logger.fatal("failed ot upload directory", error);
    }
}

export const get_files_with_github_api = async (full_repo_name: string, branch: string, new_project_path: string) => {
    if (!command_on_system("tar")) {
        logger.fatal('please install "tar" extraction command line');
    }
    const github_personal_access_token = await get_token_for_repo(full_repo_name);
    await download_repo_files(full_repo_name, branch, github_personal_access_token, new_project_path);
};


const download_repo_files = async (
    repo_name: string,
    branch: string,
    github_personal_access_token: string,
    new_project_path: string,
) => {
    const tar_exist = command_on_system("tar");
    if (!tar_exist) {
        logger.fatal("Please install `tar` command line on your os to continue");
    }

    loadingSpinner.start();

    loadingSpinner.text = `Downloading: 0.00%`;

    const request_body: AxiosRequestConfig<any> = {
        method: "GET",
        url: `${repo_name_to_api_link(repo_name)}/tarball/${branch}`,
        headers: {
            Authorization: `Bearer ${github_personal_access_token}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
        responseType: "stream",
    };
    try {
        const { data, headers } = await axios(request_body);

        return new Promise((resolve, reject) => {
            const new_project_full_path = path.resolve(new_project_path);
            const tar_full_path = path.resolve(path.join("./", "empty_template.tar.gz"));
            const writer = fs.createWriteStream(tar_full_path);
            const content_length: number | undefined = Number(headers["Content-Length"]) || undefined;
            let downloaded_length = 0;

            data.on("data", (chunk: any) => {
                if (content_length) {
                    downloaded_length += chunk.length || 0;
                    loadingSpinner.text = `Downloading: ${((downloaded_length / content_length) * 100).toFixed(2)}\%`;
                } else {
                    downloaded_length += chunk.length || 0;
                    loadingSpinner.text = `Downloading: ${(downloaded_length / 1000).toFixed(2)}kb`;
                }
            });

            data.pipe(writer);

            let error: any = null;

            writer.on("error", err => {
                error = err;
                writer.close();
                logger.error(error.message);

                reject(false);
            });

            writer.on("close", () => {
                if (!error) {
                    loadingSpinner.stop();
                    run_command(`tar -xf ${tar_full_path} -C ${new_project_full_path}`, {
                        stdio: "inherit",
                        encoding: "utf-8",
                    });

                    run_command(`rm -rf ${tar_full_path}`, {
                        stdio: "inherit",
                        encoding: "utf-8",
                    });

                    const extraction_path = path.join(
                        new_project_full_path,
                        Buffer.from(
                            run_command(`ls`, {
                                encoding: "utf-8",
                                cwd: new_project_full_path,
                            }),
                        )
                            .toString("utf-8")
                            .trim(),
                    );
                    run_command(`mv ${extraction_path}/* ./.`, {
                        encoding: "utf-8",
                        cwd: new_project_full_path,
                    });

                    run_command(`mv ${path.join(extraction_path, "/.vscode")} .`, {
                        encoding: "utf-8",
                        cwd: new_project_full_path,
                    });

                    run_command(`rm -rf ${extraction_path}`, {
                        encoding: "utf-8",
                        cwd: new_project_full_path,
                    });
                    resolve(true);
                }
            });
        });
    } catch (error: any) {
        logger.error("status", error?.response?.status, "Message", error?.message, "name", error?.name);
        logger.fatal("Error: Something went wrong");
    }
};

