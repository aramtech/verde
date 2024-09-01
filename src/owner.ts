import axios from "axios";
import {} from "./github";
import logger from "./logger";
import { projectContext } from "./project";
import { readAnswerTo } from "./prompt";
import { org_name_validation_regex } from "./regex";

export const check_if_owner_exist = async (owner: string) => {
    try {
        await axios.get(`https://github.com/${owner}`);
    } catch (error: any) {
        if (error.status == 404) {
            return false;
        }
        logger.fatal("Error Occurred while trying to check if an owner exists", error);
    }
    return true;
};

export const validate_owner_name_or_exit = async (owner: string) => {
    if (!owner.match(org_name_validation_regex)) {
        logger.fatal("Invalid Owner name");
        return "";
    }
};

export const check_if_owner_exists_or_exit = async (owner: string) => {
    const exists = await check_if_owner_exist(owner);
    if (!exists) {
        logger.fatal("owner does not exist");
    }
};
export const validate_owner = async (owner: string) => {
    await validate_owner_name_or_exit(owner);
    await check_if_owner_exists_or_exit(owner);
};

export const read_owner_name = async (options?: { do_not_check_if_owner_exists: boolean }) => {
    const answer = await readAnswerTo("Please Enter Organization/Owner Name (who owns the utility)");
    if (options?.do_not_check_if_owner_exists) {
        await validate_owner_name_or_exit(answer);
        return answer;
    }
    await validate_owner(answer);
    return answer;
};

export const get_default_owner = () => {
    return projectContext.packageFile.verde.defaultOrg;
};
