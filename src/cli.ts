import type { Command } from "commander";
import { removeUtilityFromProject, initializeUtilityIn, listUtilitiesInProject } from "./project";

export const addListToProgram = (program: Command) =>
    program.command("list <path>").action(async path => {
        for (const config of await listUtilitiesInProject(path)) {
            console.log("Tool found: ", config.name);
        }
    });

export const addInitCommand = (program: Command) =>
    program.command("init <name>").action(async p => {
        await initializeUtilityIn(p);
    });

export const addRemoveUtilityCommand = (program: Command) =>
    program.command("remove <name>").action(async p => {
        await removeUtilityFromProject(".", p);
    });
