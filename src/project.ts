import { basename, join } from "path";
import { hashBuffersWithSha256 } from "./crypto";
import {
    collectDirsWithFile,
    collectFilePathsIn,
    find_project_root,
    isStoredOnDisk,
    readFiles,
    readJSON,
    removeDir,
    storeObjectInCwd,
} from "./fs";
import { checkIfNameIsAvailable } from "./github";
import logger from "./logger";
import { type UtilityFile } from "./utility";

const configFilename = "utils.json";

type UtilityDescription = {
    configFile: UtilityFile;
    path: string;
    files: string[];
};
const project_root = await find_project_root();
export const listUtilitiesInDirectory = async (projectPath: string = project_root): Promise<UtilityDescription[]> => {
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

    const utils = await listUtilitiesInDirectory(".");

    if (utils.length) {
        logger.fatal(
            "this directory contains sub utilities",
            "\n",
            utils.map(u => `${u.configFile.name}: ${u.path}`).join("\n"),
        );
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

export const removeUtilityFromProject = async (name: string, projectPath = project_root) => {
    const utils = await listUtilitiesInDirectory(projectPath);

    for (const util of utils) {
        if (util.configFile.name === name) {
            console.log("found utility file, deleting...");
            await removeDir(util.path);
            return;
        }
    }
};
