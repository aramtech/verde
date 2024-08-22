import type { Command } from "commander";
import { pull_all_utilities, pull_utility, push_utility } from "./github";
import { listUtilitiesInDirectory, pushAllUtilities } from "./project";

import {
    checkAllUtilities,
    checkUtility,
    hideUtilityInProject,
    initNewUtility,
    removeUtilityFromProject,
    revealUtilityInProject,
} from "./project";
import { validate_utility_version } from "./utility";

const addListToProgram = (program: Command) =>
    program.command("list").action(async () => {
        const utils = await listUtilitiesInDirectory(".");

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
            await push_utility(utility_name);
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

export const addCommands = (program: Command) => {
    addInitCommand(program);
    addListToProgram(program);
    addRemoveUtilityCommand(program);
    addPushUtilityCommand(program);
    addPullCommand(program);
    addHideCommand(program);
    addRevealCommand(program);
    addCheckCommand(program);

    return program;
};
