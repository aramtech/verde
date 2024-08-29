import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import fs from "fs";
import path from "path";
import { command_on_system, run_command } from "../../exec";
import { collectFilePathsIn } from "../../fs";
import { delete_file_from_repo, deleteBranchOnFailure, forceUploadFileToRepo, get_token_for_repo, list_files_in_repo, repo_name_to_api_link } from "../../github";
import logger, { loadingSpinner } from "../../logger";



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
        logger.fatal("Error: Something went wrong");
    }
};

