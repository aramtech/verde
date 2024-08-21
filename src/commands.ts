import type { Command } from "commander";

import {
    removeUtilityFromProject,
    initNewUtility,
    listUtilitiesInProject,
    hideUtilityInProject,
    revealUtilityInProject,
} from "./project";

const addListToProgram = (program: Command) =>
    program.command("list").action(async () => {
        const utils = await listUtilitiesInProject(".");

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
        await removeUtilityFromProject(".", p);
    });

const addHideCommand = (program: Command) =>
    program.command("hide <name>").action(async name => {
        await hideUtilityInProject(".", name);
    });

const addRevealCommand = (program: Command) =>
    program.command("reveal <name>").action(async name => {
        await revealUtilityInProject(".", name);
    });

export const addCommands = (program: Command) => {
    addInitCommand(program);
    addListToProgram(program);
    addRemoveUtilityCommand(program);
    addHideCommand(program);

    return program;
};
