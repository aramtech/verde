import type { Command } from "commander";
import {
    deleteBranchOnFailure,
    get_org_name_and_token,
    get_utility_versions,
    pull_all_utilities,
    pull_utility,
} from "./github";
import { getUtilityByName, listUtilitiesInDirectory, pushAllUtilities } from "./project";

import logger from "./logger";
import {
    checkAllUtilities,
    checkUtility,
    hideUtilityInProject,
    initNewUtility,
    removeUtilityFromProject,
    revealUtilityInProject,
} from "./project";
import { push_utility } from "./upload_git_tree";
import { validate_utility_version } from "./utility";

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
    program.command("push [name]").action(async (utility_name?: string) => {
        if (utility_name) {
            console.log("pushing single");
            await push_utility(utility_name);
            return;
        }
        await pushAllUtilities();
    });

const addHideCommand = (program: Command) =>
    program.command("hide <name>").action(async name => {
        await hideUtilityInProject(name);
    });

const addRevealCommand = (program: Command) =>
    program.command("reveal <name>").action(async name => {
        await revealUtilityInProject(name);
    });

const addCheckCommand = (program: Command) =>
    program.command("check [name]").action(async (name?: string) => {
        if (name) {
            await checkUtility(name);
            return;
        }

        await checkAllUtilities();
    });

const addDeleteBranchVersion = (program: Command) =>
    program.command("delete-version <utility_name> <version>").action(async (utility_name, version: string) => {
        const record = await get_org_name_and_token();
        const util = await getUtilityByName(utility_name);
        const validated_version = validate_utility_version(version);
        if (!util) {
            logger.fatal("utility does not exist");
            return;
        }
        const utility_available_versions = await get_utility_versions(record.org_name, util.configFile.name);
        const found_version = utility_available_versions.find(v => v.version == version);
        if (!found_version) {
            logger.fatal("Version is not found");
            return;
        }
        await deleteBranchOnFailure(record.org_name, util?.configFile.name, version);
    });

const addPullCommand = (program: Command) =>
    program
        .command("pull [name]")
        .option("-v, --version <version>")
        .action(
            async (
                name: string | undefined,
                options: {
                    version?: string;
                },
            ) => {
                const { version } = options;
                if (version) {
                    validate_utility_version(version);
                }

                if (name) {
                    await pull_utility(name, version);
                    return;
                }

                await pull_all_utilities();
            },
        );

const add_list_utility_versions = (program: Command) => {
    program.command("list-versions <utility_name>").action(async (utility_name: string) => {
        const util = await getUtilityByName(utility_name);
        if (!util) {
            logger.fatal("Utility not found");
            return;
        }

        const record = await get_org_name_and_token();
        const versions = await get_utility_versions(record.org_name, util.configFile.name);

        const found_version = versions.find(v => v.version == util.configFile.version);
        if (!found_version) {
            logger.success("current version is not found remotely: ", util.configFile.version);
        }
        if (!versions.length) {
            logger.warning("\nthis utility has no releases.");
        }

        for (const version of versions) {
            logger.log(version.version == util.configFile.version ? `[${version.version}]` : `${version.version}`);
        }
    });
};

export const addCommands = (program: Command) => {
    addInitCommand(program);
    addListToProgram(program);
    addRemoveUtilityCommand(program);
    addPushUtilityCommand(program);
    addPullCommand(program);
    addHideCommand(program);
    addRevealCommand(program);
    addCheckCommand(program);
    add_list_utility_versions(program);
    addDeleteBranchVersion(program);
    return program;
};
