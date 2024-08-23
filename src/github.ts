import { Octokit } from "@octokit/rest";
import axios, { type AxiosRequestConfig } from "axios";
import fs from "fs";
import path from "path";
import url from "url";
import { download_utility } from "./download_utility.ts";
import { command_on_system, run_command } from "./exec.js";
import { collectFilePathsIn, find_project_root, readJSON, storeObjectInCwd } from "./fs.ts";
import { loadingSpinner, default as Logger, default as logger } from "./logger.js";
import { CPU_COUNT } from "./os.ts";
import { chunkArr, getUtilityByName, listUtilitiesInDirectory } from "./project.ts";
import { read_answer_to, read_choice } from "./prompt.js";
import { validate_utility_version } from "./utility.ts";

export const org_name_to_api_link = (repo_name: string) => `https://api.github.com/orgs/${repo_name}`;
export const repo_name_to_api_link = (repo_name: string) => `https://api.github.com/repos/${repo_name}`;

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
                Logger.error(error.message);

                reject(false);
            });

            writer.on("close", () => {
                if (!error) {
                    loadingSpinner.clear();
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
        Logger.fatal("Error: Something went wrong");
    }
};

export const get_token_for_repo = async (repo_name: string) => {
    let github_personal_access_token = "";

    let try_count = 0;

    while (true) {
        try_count += 1;
        if (try_count >= 3) {
            Logger.fatal("Maximum try count exceeded");
        }

        github_personal_access_token = await read_answer_to(
            "Please provide your classic personal github access token (you can create one at https://github.com/settings/tokens)\n\n Token:",
        );

        loadingSpinner.text = "Verifying Token...";
        loadingSpinner.start();

        try {
            await axios({
                method: "GET",
                url: repo_name_to_api_link(repo_name),
                headers: {
                    Authorization: `Bearer ${github_personal_access_token}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
            loadingSpinner.clear();

            break;
        } catch (error: any) {
            if (error?.status == 401) {
                logger.error("Provided token have no access to this repository");
            }
            if (error?.status == 404) {
                logger.error("repository does not exist");
            }
            Logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n");
            loadingSpinner.clear();
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
    const project_root = await find_project_root();
    const relative_utils = await get_relative_utils_paths_json();

    const record = relative_utils[project_root];

    if (record) {
        if (record.relative_utils_path != path) {
            record.relative_utils_path = path;
            await storeObjectInCwd(relative_utils_json_path, {
                ...relative_utils,
                [project_root]: record,
            });
        }
    } else {
        await storeObjectInCwd<RelativeUtilsPathsJson>(relative_utils_json_path, {
            ...relative_utils,
            [project_root]: {
                relative_utils_path: path,
            },
        });
    }
};

export const store_org_and_token = async (token: string, org_name: string) => {
    const content: TokensStore = JSON.parse(fs.readFileSync(tokens_json_path, { encoding: "utf-8" }));
    const project_root = await find_project_root();
    const found_record = content[project_root];
    if (found_record) {
        found_record.token = token;
        found_record.org_name = org_name;
        const updated_store: TokensStore = {
            ...content,
            [project_root]: found_record,
        };
        fs.writeFileSync(tokens_json_path, JSON.stringify(updated_store, null, 4));
    } else {
        const updated_store: TokensStore = {
            ...content,
            [project_root]: {
                org_name: org_name,
                token,
            },
        };
        fs.writeFileSync(tokens_json_path, JSON.stringify(updated_store, null, 4));
    }
};
export const get_org_and_token_from_store = async () => {
    if (fs.existsSync(tokens_json_path)) {
        const store: TokensStore = JSON.parse(fs.readFileSync(tokens_json_path, "utf-8"));
        const record = store[await find_project_root()] as
            | {
                  token: string;
                  org_name: string;
              }
            | undefined;
        return record || null;
    }
    return null;
};

let cached_record: {
    token: string;
    org_name: string;
} | null = null;
export const get_org_name_and_token = async () => {
    if (cached_record) {
        return cached_record;
    }
    const stored_record = await get_org_and_token_from_store();
    if (stored_record) {
        cached_record = stored_record;
        return stored_record;
    }

    const org_name = await read_answer_to("Please input your organization name:");
    const token = await get_token_for_org(org_name);

    const choice: "yes" | "no" = (await read_choice("would you like to store token and organization name", [
        "yes",
        "no",
    ])) as "yes" | "no";

    if (choice == "yes") {
        store_org_and_token(token, org_name);
    }
    const record: {
        token: string;
        org_name: string;
    } = {
        token,
        org_name,
    };
    cached_record = record;
    return record;
};

export const get_token_for_org = async (org_name: string) => {
    let github_personal_access_token = "";

    let try_count = 0;

    while (true) {
        try_count += 1;
        if (try_count >= 3) {
            Logger.fatal("Maximum try count exceeded");
        }

        github_personal_access_token = await read_answer_to(
            "Please provide your classic personal github access token (you can create one at https://github.com/settings/tokens)\n\n Token:",
        );

        loadingSpinner.text = "Verifying Token...";
        loadingSpinner.start();

        try {
            await axios({
                method: "GET",
                url: org_name_to_api_link(org_name),
                headers: {
                    Authorization: `Bearer ${github_personal_access_token}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });
            loadingSpinner.clear();

            break;
        } catch (error: any) {
            if (error?.status == 401) {
                logger.error("Provided token have no access to this organization");
            }
            if (error?.status == 404) {
                Logger.fatal("organization does not exist");
            }
            Logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n");
            loadingSpinner.clear();
            continue;
        }
    }
    return github_personal_access_token;
};

export const get_files_with_github_api = async (full_repo_name: string, branch: string, new_project_path: string) => {
    if (!command_on_system("tar")) {
        Logger.fatal('please install "tar" extraction command line');
    }
    const github_personal_access_token = await get_token_for_repo(full_repo_name);
    await download_repo_files(full_repo_name, branch, github_personal_access_token, new_project_path);
};

let octokit: Octokit | null = null;
export const get_octokit_client_for_org = async () => {
    if (octokit) {
        return octokit;
    }
    const record = await get_org_name_and_token();

    const client = new Octokit({
        auth: record.token,
        log: {
            info(message) {
                logger.log(message);
            },
            error(message) {
                if (message.match(/\b404\b/)) {
                    return;
                }
                logger.error(message);
            },
            debug(message) {
                // console.debug(message);
            },
            warn(message) {
                logger.warning(message);
            },
        },
    });
    octokit = client;
    return client;
};

export async function check_if_repository_exists_in_org(org: string, repo: string) {
    try {
        const octokit = await get_octokit_client_for_org();
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

export async function create_repository_in_org(org: string, repo: string) {
    console.log("creating repository");
    const octokit = await get_octokit_client_for_org();
    const exists = await check_if_repository_exists_in_org(org, repo);

    if (!exists) {
        loadingSpinner.text = "creating repo...";
        loadingSpinner.start();

        try {
            const response = await octokit.repos.createInOrg({
                org: org,
                name: repo,
                description: "This is a description of the new repository",
                private: true, // Set to true if you want to create a private repository
            });
            loadingSpinner.clear();

            Logger.success("Repository created successfully in the organization:", response.data?.html_url);
        } catch (error) {
            Logger.fatal("Error creating repository:", error);
        }
        loadingSpinner.clear();
    }
}

export async function list_branches(owner: string, repo: string, kill = false) {
    const octokit = await get_octokit_client_for_org();
    try {
        const { data: branches } = await octokit.repos.listBranches({
            owner,
            repo,
        });

        return branches;
    } catch (error: any) {
        if (kill) {
            logger.fatal(`Error listing branches: ${error.message}`);
        }
        return [];
    }
}

export async function get_utility_versions(owner: string, utility: string) {
    const branches = await list_branches(owner, utility);
    if (branches) {
        const versions_branches = branches
            .map(b => {
                try {
                    const v = validate_utility_version(b.name, false);
                    return v;
                } catch (error) {
                    return null;
                }
            })
            .filter(v => !!v)
            .sort((a, b) => {
                if (compare_version(a.version, ">", b.version)) {
                    return 1;
                } else if (compare_version(a.version, "<", b.version)) {
                    return -1;
                } else {
                    return 0;
                }
            });
        return versions_branches;
    }
    return [];
}

export async function create_branch_if_not_exists(owner: string, repo: string, branch: string, baseBranch = "main") {
    const octokit = await get_octokit_client_for_org();
    try {
        // Check if the branch exists
        await octokit.repos.getBranch({
            owner,
            repo,
            branch,
        });
        console.log(`Branch ${branch} already exists.`);
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

            console.log(`Branch ${branch} created from ${baseBranch}.`);
        } else {
            throw error;
        }
    }
}

// works
export async function delete_file_from_repo(owner: string, repo: string, file_path: string, branch: string) {
    try {
        const octokit = await get_octokit_client_for_org();
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

        console.log(`Deleted file: ${file_path}`);
    } catch (error) {
        logger.fatal(`Error deleting file ${file_path}:`, error);
    }
}

// works but no need for it
export async function list_files_in_repo(owner: string, repo: string, branch: string, repoPath = "") {
    try {
        const octokit = await get_octokit_client_for_org();
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
    const octokit = await get_octokit_client_for_org();
    try {
        // Check if the file already exists in the repo
        const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo,
            path: repoPath,
            ref: branch,
        });
        console.log("existing file sha", (existingFile as any).sha);
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

        console.log(`Updated file: ${repoPath}`);
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

            console.log(`Created new file: ${repoPath}`);
        } else {
            logger.fatal(`Error processing file ${repoPath}:`, error);
        }
    }
}

export async function deleteBranchOnFailure(owner: string, repo: string, branch: string) {
    try {
        const octokit = await get_octokit_client_for_org();
        await octokit.git.deleteRef({
            owner,
            repo,
            ref: `heads/${branch}`,
        });
        console.log(`Branch ${branch} deleted successfully.`);
    } catch (error) {
        logger.fatal(`Failed to delete branch ${branch}:`, error);
    }
}

// dont use
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
        console.log("going to upload files", files);
        let promises = [] as any[];
        for (const file of files) {
            const repoItemPath = file.slice(localDir.length + 1).replace(/\\/g, "/"); // Ensure repo path is Unix-style
            console.log("uploading file", {
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
        console.log("files to delete", filesToDelete);
        const deletePromises = filesToDelete.map(file => delete_file_from_repo(owner, repo, file, branch));
        await Promise.all(deletePromises);
    } catch (error) {
        await deleteBranchOnFailure(owner, repo, branch);
        logger.fatal("failed ot upload directory", error);
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
        const octokit = await get_octokit_client_for_org();
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

            console.log(`Deleted existing file: ${filePath}`);
        } catch (error: any) {
            if (error.status !== 404) {
                throw error; // Re-throw errors that aren't 404
            }
            // If the file doesn't exist, proceed to upload as new
            console.log(`File ${filePath} does not exist, uploading as a new file.`);
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
        const octokit = await get_octokit_client_for_org();
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

export const compare_version = (version_a: string, operation: "==" | "<" | ">" | "<=" | ">=", version_b: string) => {
    const a = validate_utility_version(version_a);
    const b = validate_utility_version(version_b);

    if (operation == "<") {
        if (a.major != b.major) {
            return a.major < b.major;
        }
        if (a.minor != b.minor) {
            return a.minor < b.minor;
        }
        return a.batch < b.batch;
    }

    if (operation == "<=") {
        if (a.major != b.major) {
            return a.major <= b.major;
        }
        if (a.minor != b.minor) {
            return a.minor <= b.minor;
        }
        return a.batch <= b.batch;
    }

    if (operation == "==") {
        return a.version == b.version;
    }

    if (operation == ">=") {
        if (a.major != b.major) {
            return a.major >= b.major;
        }
        if (a.minor != b.minor) {
            return a.minor >= b.minor;
        }
        return a.batch >= b.batch;
    }

    if (operation == ">") {
        if (a.major != b.major) {
            return a.major > b.major;
        }
        if (a.minor != b.minor) {
            return a.minor > b.minor;
        }
        return a.batch > b.batch;
    }
};

export const pull_utility = async (utility_name: string, version?: string) => {
    /**
     *  - check if the utility has remote version
     *    - if not prompt that this utility does not exist remotely
     *  - if there is version passed
     *    - check if the version exists remotely
     *    - if not prompt and exit
     *
     *   - specify required versoin either lts or specified
     *
     *  - check if the utility exists locally
     *  - if it does
     *    - compare versions of local to remote
     *      - if version specified
     *        - specified version != current
     *          - pull specified version into prompted utils dir path
     *      - else
     *        - if local greater
     *          - prompt you are up to date and exit
     *        - if local lower
     *          - pull specified version into prompted utils dir path
     *        - if local equals remote
     *          - prompt you are up to date and exit
     *  - if not
     *    - pull specified version into prompted utils dir path
     *
     */
    const record = await get_org_name_and_token();
    const versions = await get_utility_versions(record.org_name, utility_name);
    if (!versions.length || !versions.at(-1)) {
        logger.fatal("Remote Utility is not detected, and have no versions");
        return;
    }
    let selected_version: {
        version: string;
        major: number;
        minor: number;
        batch: number;
        combined: number;
    };
    if (version) {
        const found_version = versions.find(v => v.version == version);
        if (!found_version) {
            logger.fatal("Specified version", version, "is not found remotely");
            return;
        }
        selected_version = found_version;
    } else {
        selected_version = versions.at(-1) as {
            version: string;
            major: number;
            minor: number;
            batch: number;
            combined: number;
        };
    }

    const util = await getUtilityByName(utility_name);

    const pull = async () => {
        download_utility(utility_name, selected_version.version);
    };
    const up_to_date = async () => {
        logger.success("utility", utility_name, "Up to date");
        return;
    };

    if (!util) {
        await pull();
    } else {
        if (version) {
            console.log("requesting specific version", version);
            if (!compare_version(selected_version.version, "==", util.configFile.version)) {
                return await pull();
            } else {
                return up_to_date();
            }
        } else {
            if (compare_version(selected_version.version, ">", util.configFile.version)) {
                await pull();
            } else if (compare_version(selected_version.version, "<", util.configFile.version)) {
                logger.warning("you local version is greater than remote latest, please push updates");
                return;
            } else {
                return up_to_date();
            }
        }
    }
};

export const pull_all_utilities = async () => {
    const utilities = await listUtilitiesInDirectory(await find_project_root());
    const chunked = chunkArr(utilities, CPU_COUNT * 2);

    for (const chunk of chunked) {
        await Promise.all(chunk.map(c => pull_utility(c.configFile.name)));
    }
};
