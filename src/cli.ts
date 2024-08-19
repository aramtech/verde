import type { Command } from "commander";
import { collectDirsWithFile, readFiles } from "./fs";
import { parseUtilityFileFromBuffer } from "./utility";
import { join } from "path";

export const addListToProgram = (program: Command) =>
    program.command("list <path>").action(async path => {
        const traverseResult = await collectDirsWithFile(path, {
            exclude: ["node_modules", ".git"],
            configFilename: "utils.json",
        });

        const utilsConfigFilePaths = traverseResult.map(t => join(".", t.dirPath, "utils.json"));
        const utilsFilesContent = await readFiles(utilsConfigFilePaths);
        const utilConfigs = utilsFilesContent.map(parseUtilityFileFromBuffer);

        for (const config of utilConfigs) {
            console.log("Tool found: ", config.name);
        }
    });
