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
import logger from "./logger";
import { CPU_COUNT } from "./os";
import { push_utility } from "./upload_git_tree";
import { type UtilityFile, markUtilityAsPublic, markUtilityFileAsPrivate, updateUtilityHash } from "./utility";

const configFilename = "utils.json";

type UtilityDescription = {
    configFile: UtilityFile;
    path: string;
    files: string[];
};

export const listUtilitiesInDirectory = async (projectPath: string): Promise<UtilityDescription[]> => {
    const traverseResult = await collectDirsWithFile(projectPath, {
        exclude: ["node_modules", ".git", "dist"],
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

export type ProjectContext<Params> = {
    utilities: UtilityDescription[];
    path: string;
    params: Params;
};

export const assembleProjectContext = async <T>(path: string, params: T): Promise<ProjectContext<T>> => {
    const utilities = await listUtilitiesInDirectory(path);
    const rootPath = await find_project_root(path);

    return {
        utilities,
        path: rootPath,
        params,
    };
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

    const nameNotAvailable = utils.some(u => u.configFile.name === name);

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
        private: false,
        hash,
        version: "0.1.0",
        description,
    });
};

export const removeUtilityFromProject = async (name: string, projectPath?: string) => {
    if (!projectPath) {
        projectPath = await find_project_root();
    }

    const utils = await listUtilitiesInDirectory(projectPath);

    for (const util of utils) {
        if (util.configFile.name === name) {
            console.log("found utility file, deleting...");
            await removeDir(util.path);
            return;
        }
    }
};

export const getUtilityByName = async (name: string): Promise<UtilityDescription | undefined> => {
    const projectRoot = await find_project_root();
    const utils = await listUtilitiesInDirectory(projectRoot);
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
    logger.log(`looking for utility "${nameOrDesc}"`);
    const util = typeof nameOrDesc === "string" ? await getUtilityByName(nameOrDesc) : nameOrDesc;

    if (!util) {
        logger.fatal(`could not find utility with name ${nameOrDesc}`);
        process.exit(1);
    }

    console.log(`found utility "${util.configFile.name}" computing it's file hash...`);

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
        return {
            currentHash,
            previousHash,
            match: currentHash == previousHash,
        };
    }
    console.log(`utility "${util.configFile.name}" hash match!. no changes detected`);

    return {
        currentHash,
        previousHash,
        match: currentHash == previousHash,
    };
};
export const chunkArr = <T>(arr: T[], chunkSize: number): T[][] => {
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

export const checkAllUtilities = async () => {
    const utilities = await listUtilitiesInDirectory(await find_project_root());
    const chunked = chunkArr(utilities, CPU_COUNT * 2);

    for (const chunk of chunked) {
        await Promise.all(chunk.map(c => checkUtility(c)));
    }
};

export const pushAllUtilities = async () => {
    const utilities = await listUtilitiesInDirectory(await find_project_root());
    const chunked = chunkArr(utilities, CPU_COUNT * 2);

    for (const chunk of chunked) {
        await Promise.all(chunk.map(c => push_utility(c.configFile.name)));
    }
};
