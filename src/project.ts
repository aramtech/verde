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
import { type UtilityFile, markUtilityFileAsPrivate, markUtilityAsPublic, updateUtilityHash } from "./utility";
import { hashBuffersWithSha256 } from "./crypto";
import { checkIfNameIsAvailable } from "./github";
import { CPU_COUNT } from "./os";

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

const getUtilityByName = async (name: string): Promise<UtilityDescription | undefined> => {
    const utils = await listUtilitiesInProject(".");
    return utils.find(u => u.configFile.name === name);
};

export const hideUtilityInProject = async (name: string) => {
    const util = await getUtilityByName(name);

    if (!util) {
        console.error(`could not find utility with name ${name}`);
        return;
    }

    const nextUtilityFile = markUtilityFileAsPrivate(util.configFile);
    await storeObjectInCwd<UtilityFile>(join(util.path, configFilename), nextUtilityFile);
    console.log("done!");
};

export const revealUtilityInProject = async (name: string) => {
    const util = await getUtilityByName(name);

    if (!util) {
        console.error(`could not find utility with name ${name}`);
        return;
    }

    const nextUtilityFile = markUtilityAsPublic(util.configFile);
    await storeObjectInCwd<UtilityFile>(join(util.path, configFilename), nextUtilityFile);
    console.log("done!");
};

export const checkUtility = async (nameOrDesc: string | UtilityDescription) => {
    const util = typeof nameOrDesc === "string" ? await getUtilityByName(nameOrDesc) : nameOrDesc;

    if (!util) {
        console.error(`could not find utility with name ${nameOrDesc}`);
        return;
    }

    console.log(`found ${util.configFile.name} computing it's file hash...`);

    const previousHash = util.configFile.hash || "";

    const utilFilePaths = util.files.filter(f => basename(f) !== configFilename);
    const files = await readFiles(utilFilePaths);
    const currentHash = hashBuffersWithSha256(files);

    if (previousHash !== currentHash) {
        console.log(`${util.configFile.name} hash mismatch, updating on disk config file...`);
        await storeObjectInCwd<UtilityFile>(
            join(util.path, configFilename),
            updateUtilityHash(util.configFile, currentHash),
        );
        return;
    }

    console.log(`${util.configFile.name} hash match!.`);
};

export const checkAllUtilities = async () => {
    const chunkArr = <T>(arr: T[], chunkSize: number): T[][] => {
        let result: T[][] = [];
        let currentChunk: T[] = [];

        for (const item of arr) {
            currentChunk.push(item);

            if (currentChunk.length === chunkSize) {
                result = [...result, currentChunk];
                currentChunk = [];
            }
        }

        if (currentChunk.length) {
            result = [...result, currentChunk];
        }

        return result;
    };

    const utilities = await listUtilitiesInProject(".");
    const chunked = chunkArr(utilities, CPU_COUNT);

    for (const chunk of chunked) {
        await Promise.all(chunk.map(c => checkUtility(c)));
    }
};
