import { collectDirsWithFile, isStoredOnDisk, readFiles, readJSON, removeDir, storeObjectInCwd } from "./fs";
import { join } from "path";
import { type UtilityFile, initUtility, parseUtilityFileFromBuffer } from "./utility";

const configFilename = "utils.json";

export const listUtilitiesInProject = async (projectPath: string) => {
    const traverseResult = await collectDirsWithFile(projectPath, {
        exclude: ["node_modules", ".git"],
        configFilename: configFilename,
    });

    const utilsConfigFilePaths = traverseResult.map(t => join(".", t.dirPath, configFilename));
    const utilsFilesContent = await readFiles(utilsConfigFilePaths);
    const utilConfigs = utilsFilesContent.map(parseUtilityFileFromBuffer);

    return utilConfigs;
};

export const initializeUtilityIn = async (name: string) => {
    const util = initUtility(name);

    if (await isStoredOnDisk(configFilename)) {
        console.error("utility already managed by verde");
        return;
    }

    await storeObjectInCwd(configFilename, util);
};

export const removeUtilityFromProject = async (projectPath: string, name: string) => {
    const traverseResult = await collectDirsWithFile(projectPath, {
        exclude: ["node_modules", ".git"],
        configFilename: configFilename,
    });

    for (const tr of traverseResult) {
        const configFile = await readJSON<UtilityFile>(join(".", tr.dirPath, configFilename));

        if (configFile.name === name) {
            console.log("found utility file, deleting...");
            await removeDir(tr.dirPath);
            return;
        }
    }
};
