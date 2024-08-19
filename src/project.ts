import { collectDirsWithFile, isStoredOnDisk, readFiles, storeObjectInCwd } from "./fs";
import { join } from "path";
import { initUtility, parseUtilityFileFromBuffer } from "./utility";

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
