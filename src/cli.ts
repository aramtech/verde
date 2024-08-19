import type { Command } from "commander";
import { collectDirsWithFile, isStoredOnDisk, readFiles, storeObjectInCwd } from "./fs";
import { initUtility, parseUtilityFileFromBuffer } from "./utility";
import { join } from "path";

const configFilename = "utils.json";

export const addListToProgram = (program: Command) =>
    program.command("list <path>").action(async path => {
        const traverseResult = await collectDirsWithFile(path, {
            exclude: ["node_modules", ".git"],
            configFilename: configFilename,
        });

        const utilsConfigFilePaths = traverseResult.map(t => join(".", t.dirPath, configFilename));
        const utilsFilesContent = await readFiles(utilsConfigFilePaths);
        const utilConfigs = utilsFilesContent.map(parseUtilityFileFromBuffer);

        for (const config of utilConfigs) {
            console.log("Tool found: ", config.name);
        }
    });

export const addInitCommand = (program: Command) =>
    program.command("init <name>").action(async p => {
        const util = initUtility(p);

        if (await isStoredOnDisk(configFilename)) {
            console.error("utility already managed by verde");
            return;
        }

        await storeObjectInCwd(configFilename, util);
    });
