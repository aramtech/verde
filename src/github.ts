import { Octokit } from "@octokit/rest";
import axios, { type AxiosRequestConfig } from "axios";
import fs from "fs";
import ora from "ora";
import path from "path";
import url from "url";
import { download_utility } from "./download_utility.ts";
import { command_on_system, run_command } from "./exec.js";
import { find_project_root, readJSON, storeObjectInCwd } from "./fs.ts";
import { default as Logger, default as logger } from "./logger.js";
import { CPU_COUNT } from "./os.ts";
import { checkUtility, chunkArr, getUtilityByName, listUtilitiesInDirectory } from "./project.ts";
import { read_answer_to, read_choice } from "./prompt.js";
import { type ParsedVersion, isUtilityNameValid, parseUtilityVersion } from "./utility.ts";

export const checkIfNameIsAvailable = async (name: string) => {
    const utils = await listUtilitiesInDirectory(await find_project_root());
    if (utils.find(u => u.configFile.name == name)) {
        return false;
    }
    return true;
};
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

    const loadingSpinner = ora();
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
        console.error("status", error?.response?.status, "Message", error?.message, "name", error?.name);
        Logger.fatal("Error: Something went wrong");
    }
};

export const get_token_for_repo = async (repo_name: string) => {
    let github_personal_access_token = "";

    const loadingSpinner = ora();

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
            loadingSpinner.stop();

            break;
        } catch (error: any) {
            if (error?.status == 401) {
                console.error("Provided token have no access to this repository");
            }
            if (error?.status == 404) {
                console.error("repository does not exist");
            }
            Logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n");
            loadingSpinner.stop();
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

    const loadingSpinner = ora();

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
            loadingSpinner.stop();

            break;
        } catch (error: any) {
            if (error?.status == 401) {
                console.error("Provided token have no access to this organization");
            }
            if (error?.status == 404) {
                Logger.fatal("organization does not exist");
            }
            Logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n");
            loadingSpinner.stop();
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
    const octokit = await get_octokit_client_for_org();
    const exists = await check_if_repository_exists_in_org(org, repo);

    if (!exists) {
        const loadingSpinner = ora();
        loadingSpinner.text = "creating repo...";
        loadingSpinner.start();

        try {
            const response = await octokit.repos.createInOrg({
                org: org,
                name: repo,
                description: "This is a description of the new repository",
                private: true, // Set to true if you want to create a private repository
            });
            loadingSpinner.stop();

            Logger.success("Repository created successfully in the organization:", response.data?.html_url);
        } catch (error) {
            Logger.fatal("Error creating repository:", error);
        }
        loadingSpinner.stop();
    }
}

async function list_branches(owner: string, repo: string) {
    const octokit = await get_octokit_client_for_org();
    try {
        const { data: branches } = await octokit.repos.listBranches({
            owner,
            repo,
        });

        return branches;
    } catch (error: any) {
        logger.fatal(`Error listing branches: ${error.message}`);
    }
}

export async function get_utility_versions(owner: string, utility: string): Promise<ParsedVersion[]> {
    const branches = await list_branches(owner, utility);

    if (!branches) {
        return [];
    }

    const versions_branches = branches
        .map(b => parseUtilityVersion(b.name))
        .filter(v => !!v)
        .sort((a, b) => {
            const left = a as ParsedVersion;
            const right = b as ParsedVersion;

            if (compare_version(left.version, ">", right.version)) {
                return 1;
            } else if (compare_version(left.version, "<", right.version)) {
                return -1;
            }

            return 0;
        });

    return versions_branches as ParsedVersion[];
}

export async function create_branch_if_not_exists(owner: string, repo: string, branch: string, baseBranch = "0.1.0") {
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

async function delete_file_from_repo(owner: string, repo: string, file_path: string, branch: string) {
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

async function list_files_in_repo(owner: string, repo: string, branch: string, repoPath = "") {
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

async function upload_file_to_repo(owner: string, repo: string, fileContent: string, branch: string, repoPath: string) {
    const octokit = await get_octokit_client_for_org();
    try {
        // Check if the file already exists in the repo
        const { data: existingFile } = await octokit.repos.getContent({
            owner,
            repo,
            path: repoPath,
            ref: branch,
        });
        // Update the existing file
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: repoPath,
            message: `Update ${repoPath}`,
            content: fileContent,
            sha: (existingFile as any).sha as string,
            branch,
        });

        console.log(`Updated file: ${repoPath}`);
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

export async function upload_directory_to_repo(
    owner: string,
    repo: string,
    localDir: string,
    branch: string,
    repoPath = "",
) {
    const items = fs.readdirSync(localDir);
    const filesToUpload: string[] = [];

    const uploadPromises = items.map(async item => {
        const localItemPath = path.join(localDir, item);
        const repoItemPath = path.join(repoPath, item).replace(/\\/g, "/"); // Ensure repo path is Unix-style

        const stats = fs.statSync(localItemPath);

        if (stats.isDirectory()) {
            return upload_directory_to_repo(owner, repo, localItemPath, branch, repoItemPath);
        } else if (stats.isFile()) {
            const fileContent = fs.readFileSync(localItemPath, { encoding: "base64" });
            filesToUpload.push(repoItemPath);
            return await upload_file_to_repo(owner, repo, fileContent, branch, repoItemPath);
        }
    });

    await Promise.all(uploadPromises);

    // Compare with existing files and delete those that are not in the new push
    const existingFiles = await list_files_in_repo(owner, repo, branch, repoPath);
    const filesToDelete = existingFiles.filter(file => !filesToUpload.includes(file));

    const deletePromises = filesToDelete.map(file => delete_file_from_repo(owner, repo, file, branch));
    await Promise.all(deletePromises);
}

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

type SingleGithubFile = {
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
    const a = parseUtilityVersion(version_a) as ParsedVersion;
    const b = parseUtilityVersion(version_b) as ParsedVersion;

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

const assertUtilityNameIsValid = (n: string) => {
    if (isUtilityNameValid(n) === false) {
        logger.fatal(`${n} is not a valid utility name.`);
        process.exit(1);
    }
};

const assertUtilityVersionIsValid = (v: string) => {
    if (parseUtilityVersion(v) === null) {
        logger.fatal(`${v} is not a valid utility version.`);
        process.exit(1);
    }
};

export const push_utility = async (utility_name: string) => {
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

    const utils = await listUtilitiesInDirectory(await find_project_root());

    const util = utils.find(u => u.configFile.name == utility_name);

    if (!util) {
        logger.fatal('utility named "', utility_name, '" is not found');
        return;
    }
    const hash = await checkUtility(util.configFile.name);
    util.configFile.hash = hash.currentHash;

    if (util.configFile.private) {
        logger.log(`this utility ${utility_name} is private it cannot be uploaded`);
        return;
    }

    assertUtilityVersionIsValid(util.configFile.version || "");
    assertUtilityNameIsValid(util.configFile.name);

    const record = await get_org_name_and_token();
    const result = await check_if_repository_exists_in_org(record.org_name, util.configFile.name);
    const push = async () => {
        await upload_directory_to_repo(record.org_name, utility_name, util.path, util.configFile.version || "0.1.0");
    };
    if (result) {
        const utility_versions = await get_utility_versions(record.org_name, util.configFile.name);
        const last_version = utility_versions.at(-1);
        if (last_version) {
            if (compare_version(last_version.version, "<", util.configFile.version)) {
                await create_branch_if_not_exists(
                    record.org_name,
                    util.configFile.name,
                    util.configFile.version || "0.1.0",
                    last_version.version,
                );
                return await push();
            } else if (compare_version(last_version.version, ">", util.configFile.version)) {
                logger.log(
                    `utility ${utility_name} remote version (${last_version.version}) is greater than the local version ${util.configFile.version}`,
                );
                return;
            } else {
                const last_remote_config_file = (await get_file_from_repo(
                    record.org_name,
                    util.configFile.name,
                    "utils.json",
                    last_version.version,
                )) as SingleGithubFile | null;
                if (!last_remote_config_file) {
                    logger.fatal("Error loading utility config file from remote source for utility (file not found)", {
                        utility: last_version.version,
                        name: util.configFile.name,
                    });
                    return;
                }
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
                process.exit(0);
            }
        } else {
            return await push();
        }
    } else {
        await create_repository_in_org(record.org_name, utility_name);
        await push();
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
        process.exit(0);
    };

    if (!util) {
        await pull();
    } else {
        if (version) {
            console.log("requesting specific version", version);
            if (!compare_version(selected_version.version, "==", util.configFile.version)) {
                await pull();
            } else {
                up_to_date();
            }
        } else {
            if (compare_version(selected_version.version, ">", util.configFile.version)) {
                await pull();
            } else if (compare_version(selected_version.version, "<", util.configFile.version)) {
                logger.warning("you local version is greater than remote latest, please push updates");
                process.exit(0);
            } else {
                up_to_date();
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
