// TODO: refactor this code, improve & shorten it as much as possible

import axios from "axios";
import fs from "fs";
import path from "path";
import url from "url";
import { projectRoot, readJSON, storeJSON } from "./fs.ts";
import { loadingSpinner, default as Logger, default as logger } from "./logger.js";
import { get_octokit_client } from "./octokit.ts";
import { readAnswerTo } from "./prompt.js";
import { compareVersions, parseUtilityVersion, type Version } from "./utility.ts";

export const org_name_to_api_link = (repo_name: string) => `https://api.github.com/orgs/${repo_name}`;
export const repo_name_to_api_link = (repo_name: string) => `https://api.github.com/repos/${repo_name}`;

export const get_token_for_repo = async (repo_name: string) => {
    let github_personal_access_token = "";

    let try_count = 0;

    while (true) {
        try_count += 1;
        if (try_count >= 3) {
            Logger.fatal("Maximum try count exceeded");
        }

        github_personal_access_token = await readAnswerTo(
            "Please provide your classic personal github access token (you can create one at https://github.com/settings/tokens)\n\n Token:",
        );

        logger.log("Verifying Token...");

        try {
            await axios({
                method: "GET",
                url: repo_name_to_api_link(repo_name),
                headers: {
                    Authorization: `Bearer ${github_personal_access_token}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });

            break;
        } catch (error: any) {
            if (error?.status == 401) {
                logger.error("Provided token have no access to this repository");
            }
            if (error?.status == 404) {
                logger.error("repository does not exist");
            }
            Logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n");
            continue;
        }
    }
    return github_personal_access_token;
};

const current_dir = url.fileURLToPath(new url.URL("./", import.meta.url));
export const tokens_json_path = path.join(current_dir, "token_cache.ignore.json");
export const relative_utils_json_path = path.join(current_dir, "relative_utils.ignore.json");
export type TokensStore = {
    [project_root: string]: {
        token: string;
        org_name: string;
        utils_relative_path?: string;
    };
};
if (!fs.existsSync(tokens_json_path)) {
    fs.writeFileSync(tokens_json_path, JSON.stringify({}));
}

if (!fs.existsSync(relative_utils_json_path)) {
    fs.writeFileSync(relative_utils_json_path, JSON.stringify({}));
}
export const get_tokens_json = () => readJSON<TokensStore>(tokens_json_path);

export type RelativeUtilsPathsJson = {
    [project_path: string]:
        | {
              relative_utils_path: string;
          }
        | undefined;
};
export const get_relative_utils_paths_json = () => readJSON<RelativeUtilsPathsJson>(relative_utils_json_path);
export const store_relative_utils_path = async (path: string) => {
    const project_root = projectRoot;
    const relative_utils = await get_relative_utils_paths_json();

    const record = relative_utils[project_root];

    if (record) {
        if (record.relative_utils_path != path) {
            record.relative_utils_path = path;
            await storeJSON(relative_utils_json_path, {
                ...relative_utils,
                [project_root]: record,
            });
        }
    } else {
        await storeJSON<RelativeUtilsPathsJson>(relative_utils_json_path, {
            ...relative_utils,
            [project_root]: {
                relative_utils_path: path,
            },
        });
    }
};

export async function check_if_repository_exists_in_org(org: string, repo: string) {
    try {
        const octokit = await get_octokit_client(org);
        await octokit.repos.get({
            owner: org,
            repo: repo,
        });
        Logger.log(`Repository "${repo}" already exists in the organization "${org}".`);
        return true;
    } catch (error: any) {
        if (error.status === 404) {
            Logger.log(`Repository "${repo}" does not exist in the organization "${org}".`);
            return false;
        } else {
            Logger.fatal("Error checking repository:", error);
            return false;
        }
    }
}

export async function create_repository_in_org(org: string, repo: string, public_repo: boolean) {
    logger.log("creating repository");
    const octokit = await get_octokit_client(org);
    const exists = await check_if_repository_exists_in_org(org, repo);
    if (!exists) {
        loadingSpinner.text = "creating repo...";
        loadingSpinner.start();

        try {
            const response = await octokit.repos.createInOrg({
                org: org,
                name: repo,
                description: "This is a description of the new repository",
                visibility: public_repo ? "public" : "private", // Set to true if you want to create a private repository
                auto_init: true,
            });
            loadingSpinner.stop();

            Logger.success("Repository created successfully in the organization:", response.data?.html_url);
        } catch (error) {
            Logger.fatal("Error creating repository:", error);
        }
        loadingSpinner.stop();
    }
}

export async function list_branches(owner: string, repo: string, kill = false) {
    const octokit = await get_octokit_client(owner);
    try {
        const { data: branches } = await octokit.repos.listBranches({
            owner,
            repo,
        });

        return branches;
    } catch (error: any) {
        if(error.status >= 500){
            logger.fatal(`Error listing branches: ${error.message}`);
        }
        if (kill) {
            logger.fatal(`Error listing branches: ${error.message}`);
        }
        return [];
    }
}

const cachedVersions: {
    [utility: string]: Version[];
} = {};
export async function get_utility_versions(owner: string, utility: string, use_cache = false) {
    if (cachedVersions[utility] && use_cache) {
        return cachedVersions[utility];
    }
    const branches = await list_branches(owner, utility);
    if (branches) {
        const versions_branches = branches
            .map(b => parseUtilityVersion(b.name))
            .filter(v => !!v)
            .sort((a, b) => {
                const left = a as Version;
                const right = b as Version;

                if (compareVersions(left, ">", right)) {
                    return 1;
                } else if (compareVersions(left, "<", right)) {
                    return -1;
                }

                return 0;
            });
        cachedVersions[utility] = versions_branches;
        return versions_branches;
    }
    cachedVersions[utility] = [];
    return [];
}

export async function create_branch_if_not_exists(owner: string, repo: string, branch: string, baseBranch = "main") {
    const octokit = await get_octokit_client(owner);
    try {
        // Check if the branch exists
        await octokit.repos.getBranch({
            owner,
            repo,
            branch,
        });
        logger.log(`Branch ${branch} already exists.`);
    } catch (error: any) {
        if (error.status === 404) {
            // Branch does not exist, create it from the base branch
            const { data: baseBranchData } = await octokit.repos.getBranch({
                owner,
                repo,
                branch: baseBranch,
            });

            await octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branch}`,
                sha: baseBranchData.commit.sha,
            });

            logger.log(`Branch ${branch} created from ${baseBranch}.`);
        } else {
            throw error;
        }
    }
}

// works
export async function delete_file_from_repo(owner: string, repo: string, file_path: string, branch: string) {
    try {
        const octokit = await get_octokit_client(owner);
        const { data: file } = await octokit.repos.getContent({
            owner,
            repo,
            path: file_path,
            ref: branch,
        });

        await octokit.repos.deleteFile({
            owner,
            repo,
            path: file_path,
            message: `Delete ${file_path}`,
            sha: (file as any).sha,
            branch,
        });

        logger.log(`Deleted file: ${file_path}`);
    } catch (error) {
        logger.fatal(`Error deleting file ${file_path}:`, error);
    }
}

// works but no need for it
export async function list_files_in_repo(owner: string, repo: string, branch: string, repoPath = "") {
    try {
        const octokit = await get_octokit_client(owner);
        const { data: contents } = await octokit.repos.getContent({
            owner,
            repo,
            path: repoPath,
            ref: branch,
        });

        let files: string[] = [];

        for (const item of contents as any[]) {
            if (item.type === "file") {
                files.push(item.path);
            } else if (item.type === "dir") {
                files = files.concat(await list_files_in_repo(owner, repo, branch, item.path));
            }
        }

        return files;
    } catch (error: any) {
        if (error.status === 404) {
            return [];
        }
        throw error;
    }
}

// dont use
export async function upload_file_to_repo(
    owner: string,
    repo: string,
    fileContent: string,
    branch: string,
    repoPath: string,
) {
    const octokit = await get_octokit_client(owner);
    try {
        // Check if the file already exists in the repo
        const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo,
            path: repoPath,
            ref: branch,
        });
        logger.log("existing file sha", (existingFile as any).sha);
        // Update the existing file
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: repoPath,
            message: `Update ${repoPath} version ${branch}`,
            content: fileContent,
            sha: (existingFile as any).sha as string,
            branch,
        });

        logger.log(`Updated file: ${repoPath}`);
        return;
    } catch (error: any) {
        if (error.status === 404) {
            // File does not exist, create a new one
            try {
                await octokit.repos.createOrUpdateFileContents({
                    owner,

                    repo,
                    path: repoPath,
                    message: `Add ${repoPath}`,
                    content: fileContent,
                    branch,
                });
            } catch (error) {
                logger.fatal("reupload for new file error", error);
            }

            logger.log(`Created new file: ${repoPath}`);
        } else {
            logger.fatal(`Error processing file ${repoPath}:`, error);
        }
    }
}

export async function deleteBranchOnFailure(owner: string, repo: string, branch: string) {
    try {
        const octokit = await get_octokit_client(owner);
        await octokit.git.deleteRef({
            owner,
            repo,
            ref: `heads/${branch}`,
        });
        logger.log(`Branch ${branch} deleted successfully.`);
    } catch (error) {
        logger.fatal(`Failed to delete branch ${branch}:`, error);
    }
}

// dont use
export async function forceUploadFileToRepo(
    owner: string,
    repo: string,
    filePath: string,
    content: string,
    branch: string,
) {
    try {
        let sha;
        const octokit = await get_octokit_client(owner);
        try {
            // Try to get the existing file to retrieve its SHA
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: filePath,
            });
            sha = (data as any).sha as string;

            // If the file exists, delete it
            await octokit.repos.deleteFile({
                owner,
                repo,
                path: filePath,
                message: `Delete existing file before force uploading: ${branch}`,
                sha,
            });

            logger.log(`Deleted existing file: ${filePath}`);
        } catch (error: any) {
            if (error.status !== 404) {
                throw error; // Re-throw errors that aren't 404
            }
            // If the file doesn't exist, proceed to upload as new
            logger.log(`File ${filePath} does not exist, uploading as a new file.`);
        }

        // Upload the file (as a new file or after deleting the old one)
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filePath,
            message: `${content} ${branch}`,
            content: Buffer.from(content).toString("base64"), // Convert content to base64
            branch,
        });
    } catch (error) {
        logger.error("Error force uploading file:", error);
    }
}

// works
export const get_file_from_repo = async (owner: string, repo: string, repo_file_path: string, branch: string) => {
    try {
        const octokit = await get_octokit_client(owner);
        const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo,
            path: repo_file_path,
            ref: branch,
        });

        return existingFile;
    } catch (error: any) {
        if (error.status == 404) {
            return null;
        } else {
            await deleteBranchOnFailure(owner, repo, branch);
            logger.fatal(
                "Error occurred while loading file\nparameters:",
                {
                    owner,
                    repo_file_path,
                    repo,
                    branch,
                },
                "\n",
                error,
            );
            return null;
        }
    }
};

export type SingleGithubFile = {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string;
    type: string;
    content: string;
    encoding: string;
    _links: {
        self: string;
        git: string;
        html: string;
    };
};
