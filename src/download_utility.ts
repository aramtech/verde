import { run_command } from "./exec";
import { findProjectRoot, is_valid_relative_path } from "./fs";
import { get_org_name_and_token, get_relative_utils_paths_json, store_relative_utils_path } from "./github";
import logger from "./logger";
import { readAnswer, readPrompt } from "./prompt";

const axios = (await import("axios")).default;
const fs = (await import("fs-extra")).default;
const path = (await import("path")).default;
const unzipper = (await import("unzipper")).default;

export async function downloadRepoAsZip(owner: string, repo: string, branch: string, localPath: string) {
    const url = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
    console.log(url);
    const record = await get_org_name_and_token();

    const utils_dir = await get_utils_dir();
    const zipPath = path.join(utils_dir, `${repo}.zip`);

    // Download the ZIP file
    console.log("here", {
        zipPath,
        utils_dir,
    });
    const response = await axios({
        url,
        method: "GET",
        responseType: "stream",
        headers: {
            Authorization: `Bearer ${record.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });

    // Save the ZIP file
    response.data.pipe(fs.createWriteStream(zipPath));
    const project_root = await findProjectRoot();
    return new Promise<void>((resolve, reject) => {
        response.data.on("end", async () => {
            // Unzip the file
            await fs
                .createReadStream(zipPath)
                .pipe(unzipper.Extract({ path: utils_dir }))
                .promise();
            // Clean up the ZIP file
            await fs.remove(zipPath);

            run_command(`mv ${path.join(project_root, utils_dir, `${repo}-${branch}`)}   ${path.join(localPath)}`);
            resolve();
        });

        response.data.on("error", reject);
    });
}

let utils_dir_cache: string | null;
const get_utils_dir = async () => {
    if (utils_dir_cache) {
        return utils_dir_cache;
    }

    const tokens_store = await get_relative_utils_paths_json();
    const project_root = await findProjectRoot();

    const record = tokens_store[project_root];

    if (record?.relative_utils_path) {
        return record?.relative_utils_path;
    }

    const utility_relative_path = await ask_for_utility_relative_path();

    const choice: "yes" | "no" = (await readPrompt("would you like to store utils relative path", ["yes", "no"])) as
        | "yes"
        | "no";

    if (choice == "yes") {
        await store_relative_utils_path(utility_relative_path);
    }
    utils_dir_cache = utility_relative_path;
    return utility_relative_path;
};

async function ask_for_utility_relative_path() {
    let try_count = 0;
    while (true) {
        if (try_count >= 3) {
            logger.fatal("Failed to input valid utility relative path");
            process.exit(1);
        }
        const answer = await readAnswer("where do you store utils in current project");
        const valid = await is_valid_relative_path(answer);
        if (!valid) {
            logger.error(
                'invalid utilities path it must be simple directory path that exists in your project for example "server/utils"',
            );
            try_count += 1;
            continue;
        }
        if (!fs.existsSync(path.join(await findProjectRoot(), answer))) {
            logger.error(
                'invalid utilities path it must be simple directory path that exists in your project for example "server/utils"',
            );
            try_count += 1;
            continue;
        }
        return answer;
    }
}

export const download_utility = async (utility_name: string, version: string) => {
    try {
        const record = await get_org_name_and_token();
        const utils_dir = await get_utils_dir();
        console.log("utils_dir", utils_dir);
        const utility_full_path = path.join(await findProjectRoot(), utils_dir, utility_name);
        if (fs.existsSync(utility_full_path)) {
            fs.rmSync(utility_full_path, {
                recursive: true,
                force: true,
            });
        }

        await downloadRepoAsZip(record.org_name, utility_name, version, utility_full_path);
    } catch (error) {
        logger.fatal("Failed to download utility", utility_name, error);
    }
};
