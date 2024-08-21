import { Octokit } from "@octokit/rest";
import axios, { type AxiosRequestConfig } from "axios";
import fs from "fs";
import ora from "ora";
import path from "path";
import url from "url";
import { command_on_system, run_command } from "./exec.js";
import { find_project_root } from "./fs.ts";
import { default as Logger, default as logger } from "./logger.js";
import { listUtilitiesInDirectory } from "./project.ts";
import { read_answer_to, read_choice } from "./prompt.js";

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
const tokens_json_path = path.join(current_dir, "token_cache.ignore.json");
type TokensStore = {
    [project_root: string]: {
        token: string;
        org_name: string;
    };
};
if (!fs.existsSync(tokens_json_path)) {
    fs.writeFileSync(tokens_json_path, JSON.stringify({}));
}
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

export const get_files_with_github_api = async (repo_name: string, branch: string, new_project_path: string) => {
    if (!command_on_system("tar")) {
        Logger.fatal('please install "tar" extraction command line');
    }
    const github_personal_access_token = await get_token_for_repo(repo_name);
    await download_repo_files(repo_name, branch, github_personal_access_token, new_project_path);
};

let octokit: Octokit | null = null;
export const get_octokit_client_for_org = async () => {
    if (octokit) {
        return octokit;
    }
    const record = await get_org_name_and_token();

    const client = new Octokit({
        auth: record.token,
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
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: repoPath,
                message: `Add ${repoPath}`,
                content: fileContent,
                branch,
            });

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

    const uploadPromises = items.map(async item => {
        const localItemPath = path.join(localDir, item);
        const repoItemPath = path.join(repoPath, item).replace(/\\/g, "/"); // Ensure repo path is Unix-style

        const stats = fs.statSync(localItemPath);

        if (stats.isDirectory()) {
            // If the item is a directory, recurse into it
            return upload_directory_to_repo(owner, repo, localItemPath, branch, repoItemPath);
        } else if (stats.isFile()) {
            // If the item is a file, read it and upload
            const fileContent = fs.readFileSync(localItemPath, { encoding: "base64" });
            return upload_file_to_repo(owner, repo, fileContent, branch, repoItemPath);
        }
    });

    // Wait for all uploads in the current directory to complete
    await Promise.all(uploadPromises);
}
