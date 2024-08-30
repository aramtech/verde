import axios from "axios";
import { org_name_to_api_link } from "./github";
import logger, { loadingSpinner } from "./logger";
import { readAnswerTo, requestPermsToRun } from "./prompt";
import { encryptAndSaveFileToStorage, isStoredAsEncrypted, retrieveEncryptedFileFromStorage } from "./storage";
import { lock_method } from "./sync";

const tokens_cache_file_name = "tokens.json";
let password: null | string = null;
const read_tokens_password = lock_method(async () => {
    if (password) {
        return password;
    }
    password = await readAnswerTo("please enter password for your tokens cache");
    return password;
}, {
    lock_name: "read_tokens_password"
});

const create_tokens_cache_file_if_it_does_not_exist = async () => {
    const password = await read_tokens_password();
    if (!(await isStoredAsEncrypted(tokens_cache_file_name))) {
        return encryptAndSaveFileToStorage(tokens_cache_file_name, JSON.stringify({}, null, 4), password);
    }
};

const get_stored_tokens = async () => {
    await create_tokens_cache_file_if_it_does_not_exist();
    const content = await retrieveEncryptedFileFromStorage(tokens_cache_file_name, await read_tokens_password());
    if (content === null) {
        logger.fatal("Provided password is not connect, please reset cache if it is necessary");
        return {};
    }
    const tokens_map: {
        [owner: string]: string; // token
    } = JSON.parse(content);
    return tokens_map;
};

const get_token_from_storage = async (owner: string) => {
    const stored_tokens = await get_stored_tokens();
    return stored_tokens[owner] || null;
};

const store_token_in_storage = async (owner: string, token: string) => {
    const stored_tokens = await get_stored_tokens();
    if (stored_tokens[owner]) {
        const override = await requestPermsToRun("There is a matching record, do you want to override existing token?");
        if (!override) {
            return;
        }
    }
    await encryptAndSaveFileToStorage(
        tokens_cache_file_name,
        JSON.stringify({
            ...stored_tokens,
            [owner]: token,
        }),
        await read_tokens_password(),
    );
};

export const get_token_for_org = async (org_name: string) => {
    let github_personal_access_token = "";
    
    let try_count = 0;

    while (true) {
        try_count += 1;
        if (try_count > 3) {
            logger.fatal("Maximum try count exceeded");
        }

        github_personal_access_token = await readAnswerTo(
            "Please provide your classic personal github access token (you can create one at https://github.com/settings/tokens)\n\n Token:",
        );

        loadingSpinner.text = "Verifying Token for owner: "+org_name+"...";
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
                logger.error("Provided token have no access to this organization");
            }
            if (error?.status == 404) {
                logger.fatal("organization does not exist");
            }
            logger.error("\nInvalid Github Access Token, Please Make sure that the token is valid.\n" ,error);
            loadingSpinner.stop();
            continue;
        }
    }
    return github_personal_access_token;
};

let cached_record: {
    [owner: string]: string; // token
} = {};
export const get_token = lock_method(async (owner: string) => {
    if (cached_record[owner]) {
        return cached_record[owner];
    }

    const stored_token = await get_token_from_storage(owner);

    const useGlobalToken =
        !!stored_token && (await requestPermsToRun("There is a global encrypted token stored, do you wish to use it?"));

    if (useGlobalToken) {
        cached_record[owner] = stored_token;
        return stored_token;
    }

    const token = await get_token_for_org(owner);
    if (await requestPermsToRun("would you like to store token and organization name")) {
        await store_token_in_storage(owner, token);
    }
    cached_record[owner] = token;

    return token;
}, {
    lock_name: "get_token"
});

