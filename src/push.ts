import { Octokit } from "@octokit/rest";
import axios from "axios";
import fs from "fs";
import path from "path";
import { chunkArr } from "./array";
import { deleteBranchOnFailure, get_file_from_repo, get_utility_versions, type SingleGithubFile } from "./github";
import logger from "./logger";
import { CPU_COUNT } from "./os";
import { checkUtility, projectContext, type ProjectContext } from "./project";
import { upload_dir_octo } from "./push_directory";
import { get_token } from "./tokens";
import {
    collect_dependencies_list,
    compareVersions,
    isUtilityNameValid,
    parseUtilityVersion,
    process_utility_identifier_input,
    type Version,
} from "./utility";

const parseVersionOrExit = (v: string): Version => {
    const parsed = parseUtilityVersion(v);
    if (!parsed) {
        logger.fatal(`${v} is not a valid version.`);
    }
    return parsed as Version;
};

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

export const push_utility = async ({
    main_dep,
    context,
    input_utility_name,
}: {
    context: ProjectContext;
    input_utility_name: string;
    main_dep: boolean;
}) => {
    /**
     * - make sure utility actually exists --
     * - validate version number --
     * - validate utility name --
     * - check if remote repo exists
     *   - if so --
     *     - create the remote repo and --
     *     - push content --
     *   - if not --
     *     - pull remote utility branches --
     *     - get the latest branch number --
     *       - sort branches --
     *       - get latest --
     *
     *     - compare versions --
     *       - if current greater than remote push baby push --
     *       - if current equals the remote --
     *         - if hash's are equal prompt "up to date" --
     *         - if hash's are not equal prompt "did you update the version code? if not update the version code and try again." --
     *         - exit --
     *       - if current less than remote prompt that you are not up to date remote version is greater --
     *
     */

    const valid_name = isUtilityNameValid(input_utility_name);
    if (!valid_name) {
        logger.fatal("Provided Utility Name is not valid", input_utility_name);
    }

    logger.log("processing identifier")
    const {
        owner,
        repo,
        utility_current_owner_different_from_provided,
        utility_exists_on_project,
        utility_parent_dir_relative_path,
    } = await process_utility_identifier_input(input_utility_name);

    const utility_name = repo;

    logger.log("listing all utilities");
    const utils = context.utilities;

    logger.log("looking for utility");
    const util = utils.find(u => u.configFile.name == utility_name);

    if (!util) {
        logger.fatal('utility named "', utility_name, '" is not found');
        return;
    }

    logger.log("updating utility hash");
    const hash = await checkUtility(context, util.configFile.name);
    util.configFile.hash = hash.currentHash;

    if (util.configFile.private) {
        logger.warning(`this utility ${utility_name} is private it cannot be uploaded`);
        return;
    }

    logger.log("validating version");
    if (!parseUtilityVersion(util.configFile.version)) {
        logger.fatal(`${util.configFile.version} is not a valid version`);
        return;
    }

    logger.log("validating name");
    if (!isUtilityNameValid(util.configFile.name)) {
        logger.fatal(`"${util.configFile.name}" is not a valid name.`);
        return;
    }

    logger.log("getting token");
    const token = await get_token(owner);

    logger.log("collecting utility versions");
    let utility_versions = await get_utility_versions(owner, util.configFile.name);

    const last_version = utility_versions.at(-1);

    const push = async () => {
        logger.log("pushing...");
        try {
            // upload the file as a block to a new branch
            await upload_dir_octo(owner, util.configFile.name, token, util.configFile.version, util.path);
        } catch (error) {
            console.error(error);
            await deleteBranchOnFailure(owner, util.configFile.name, util.configFile.version);
        }
    };

    if (last_version) {
        const utilVersion = parseVersionOrExit(util.configFile.version);

        if (compareVersions(last_version, "<", utilVersion)) {
            await push();
        } else if (compareVersions(last_version, ">", utilVersion)) {
            logger.log(
                `utility ${utility_name} remote version (${last_version.version}) is greater than the local version ${util.configFile.version}`,
            );
        } else {
            const last_remote_config_file = (await get_file_from_repo(
                owner,
                util.configFile.name,
                "utils.json",
                last_version.version,
            )) as SingleGithubFile | null;
            if (!last_remote_config_file) {
                logger.error("Error loading utility config file from remote source for utility (file not found)", {
                    utility: last_version.version,
                    name: util.configFile.name,
                });
                await push();
            }else{
                const remote_util_config: typeof util.configFile = JSON.parse(
                    Buffer.from(last_remote_config_file.content, "base64").toString("utf-8"),
                );
    
                if (remote_util_config.hash != util.configFile.hash) {
                    logger.warning(
                        `utility: ${util.configFile.name} ,` +
                            "remote content last version equalt local, but the content is different are you sure you updated the version?",
                    );
                } else {
                    logger.success(`utility ${util.configFile.name} is up to date: ${util.configFile.version}`);
                }                
            }

        }
    } else {
        await push();
    }

    if (main_dep) {
        projectContext.packageFile.verde.dependencies[repo] = {
            owner: owner, 
            repo: repo, 
            update_policy: projectContext.packageFile.verde.dependencies[repo]?.update_policy || "minor", 
            version: util.configFile.version as any, 
        }
    }
};

export const pushAllUtilities = async (context: ProjectContext) => {
    const chunked = chunkArr(context.utilities, CPU_COUNT * 2);

    const all_dependencies = await collect_dependencies_list(projectContext, projectContext.packageFile.verde.dependencies)

    const excess_utilities = projectContext.utilities.filter(u=>{
        return !all_dependencies[u.configFile.name]
    })

    for (const chunk of chunked) {
        await Promise.all(chunk.map(u => push_utility({
            context: projectContext, 
            input_utility_name: u.configFile.name, 
            main_dep: !!projectContext.packageFile.verde.dependencies[u.configFile.name] || !!excess_utilities.find(u=>u.configFile.name == u.configFile.name)
        })));
    }
};
