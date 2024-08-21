import type { Command } from "commander";
import { find_project_root } from "./fs";
import {
    check_if_repository_exists_in_org,
    create_repository_in_org,
    get_org_name_and_token,
    upload_directory_to_repo,
} from "./github";
import logger from "./logger";
import { initNewUtility, listUtilitiesInDirectory, removeUtilityFromProject } from "./project";
import { validate_utility_name, validate_utility_version } from "./utility";

const addListToProgram = (program: Command) =>
    program.command("list").action(async () => {
        const utils = await listUtilitiesInDirectory();

        if (utils.length === 0) {
            console.warn("no tool found!.");
            return;
        }

        for (const config of utils) {
            console.log("Tool found: ", config.configFile.name);
        }
    });

const addInitCommand = (program: Command) =>
    program
        .command("init <name>")
        .option("-d, --description <description>")
        .action(async (p, { description = "" }) => {
            await initNewUtility(p, description.trim());
        });

const addRemoveUtilityCommand = (program: Command) =>
    program.command("remove <name>").action(async p => {
        await removeUtilityFromProject(p);
    });

const addPushUtilityCommand = (program: Command) =>
    program.command("push <name>").action(async utility_name => {
        /**
         * - make sure utility actually exists --
         * - validate version number --
         * - validate utility name --
         * - check if remote repo exists
         *   - if so --
         *     - create the remote repo and -- 
         *     - push content -- 
         *   - if not
         *     - pull remote utility config file
         *     - compare versions
         *       - if current greater than current push baby push
         *       - if current equals the remote
         *         - if hash's are equal prompt "up to date"
         *         - if hash's are not equal prompt "did you update the version code? if not update the version code and try again."
         *         - exit
         *       - if current less than remote prompt that you are not up to date remote version is greater
         *
         */

        const utils = await listUtilitiesInDirectory(await find_project_root());

        const util = utils.find(u => u.configFile.name == utility_name);

        if (!util) {
            logger.fatal('utility named "', utility_name, '" is not found');
            return;
        }
        if (util.configFile.private) {
            logger.error("this utility is private it cannot be uploaded");
            return;
        }

        validate_utility_version(util.configFile.version || "");
        validate_utility_name(util.configFile.name);

        const record = await get_org_name_and_token();
        const result = await check_if_repository_exists_in_org(record.org_name, util.configFile.name);
        if (result) {
        } else {
            await create_repository_in_org(record.org_name, utility_name);
            await upload_directory_to_repo(
                record.org_name,
                utility_name,
                util.path,
                util.configFile.version || "0.1.0",
            );
        }
    });

export const addCommands = (program: Command) => {
    addInitCommand(program);
    addListToProgram(program);
    addRemoveUtilityCommand(program);
    addPushUtilityCommand(program);
    return program;
};
