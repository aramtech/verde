import {
    collectDirsWithFile,
    collectFilePathsIn,
    isStoredOnDisk,
    readFiles,
    readJSON,
    removeDir,
    storeObjectInCwd,
} from "./fs";
import { join, basename } from "path";
import { type UtilityFile, parseUtilityFileFromBuffer } from "./utility";
import { hashBuffersWithSha256 } from "./crypto";
import { checkIfNameIsAvailable } from "./github";

const configFilename = "utils.json";

type UtilityDescription = {
    configFile: UtilityFile;
    path: string;
    files: string[];
};

export const listUtilitiesInProject = async (projectPath: string): Promise<UtilityDescription[]> => {
    const traverseResult = await collectDirsWithFile(projectPath, {
        exclude: ["node_modules", ".git"],
        configFilename: configFilename,
    });

    const descArr: UtilityDescription[] = [];

    for (const tr of traverseResult) {
        const configFile = await readJSON<UtilityFile>(join(tr.dirPath, configFilename));

        descArr.push({
            configFile,
            files: tr.contents,
            path: tr.dirPath,
        });
    }

    return descArr;
};

export const initNewUtility = async (name: string, description: string) => {
    if (await isStoredOnDisk(configFilename)) {
        console.error("directory already managed by verde!.");
        return;
    }

    const nameNotAvailable = (await checkIfNameIsAvailable(name)) === false;

    if (nameNotAvailable) {
        console.error("name taken by a different utility.");
        return;
    }

    const paths = await collectFilePathsIn(".");

    const sortedPaths = paths
        .slice(0)
        .sort()
        .filter(p => basename(p) !== configFilename);

    const files = await readFiles(sortedPaths);
    const hash = hashBuffersWithSha256(files);

    await storeObjectInCwd<UtilityFile>(configFilename, {
        name,
        deps: {},
        hash,
        version: "0.1.0",
        description,
    });
};

export const removeUtilityFromProject = async (projectPath: string, name: string) => {
    const utils = await listUtilitiesInProject(projectPath);

    for (const util of utils) {
        if (util.configFile.name === name) {
            console.log("found utility file, deleting...");
            await removeDir(util.path);
            return;
        }
    }
};
