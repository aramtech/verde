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
    storeJSON,
} from "./fs";
import logger from "./logger";
import { CPU_COUNT } from "./os";
import { push_utility } from "./upload_git_tree";
import { type UtilityFile, markUtilityAsPublic, markUtilityFileAsPrivate, updateUtilityHash } from "./utility";
import { chunkArr } from "./array";

const utilityConfigFileName = "utils.json";

type UtilityDescription = {
    configFile: UtilityFile;
    path: string;
    files: string[];
};

export const listUtilitiesInDirectory = async (projectPath: string): Promise<UtilityDescription[]> => {
    const traverseResult = await collectDirsWithFile(projectPath, {
        exclude: ["node_modules", ".git", "dist"],
        configFilename: utilityConfigFileName,
    });

    const descArr: UtilityDescription[] = [];

    for (const tr of traverseResult) {
        const configFile = await readJSON<UtilityFile>(join(tr.dirPath, utilityConfigFileName));

        descArr.push({
            configFile,
            files: tr.contents,
            path: tr.dirPath,
        });
    }

    return descArr;
};

type VerdeConfig = {
    deps: {};
    dest: string;
    org: string;
    grouping: Array<{
        prefix: string;
        installationDestination: string;
        organization: string;
    }>;
};

type PackageFile = {
    name: string;
    version: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    verde: VerdeConfig;
};

export type ProjectContext = {
    utilities: UtilityDescription[];
    utilitiesInCwd: UtilityDescription[];
    path: string;
    packageFile: PackageFile;
};

const selectUtilityByName = (ctx: ProjectContext, name: string): UtilityDescription | undefined =>
    ctx.utilities.find(u => u.configFile.name === name);

export const assembleProjectContext = async (pathOrCwd: string): Promise<ProjectContext> => {
    const rootPath = await find_project_root(pathOrCwd);
    const utilities = await listUtilitiesInDirectory(rootPath);
    const utilitiesInCwd = rootPath === pathOrCwd ? utilities : await listUtilitiesInDirectory(pathOrCwd);
    const packageFile = (await readJSON<PackageFile>(join(rootPath, "package.json"))) as PackageFile;

    if (packageFile.verde === undefined) {
        const verde: VerdeConfig = {
            dest: "./server/utils",
            deps: {},
            grouping: [],
            org: "aramtech",
        };

        const packageFileWithVerde = {
            ...packageFile,
            verde,
        };

        await storeJSON(join(rootPath, "package.json"), packageFileWithVerde);

        return {
            utilities,
            utilitiesInCwd,
            path: rootPath,
            packageFile: packageFileWithVerde,
        };
    }

    return {
        utilities,
        utilitiesInCwd,
        packageFile,
        path: rootPath,
    };
};

export const initNewUtility = async (context: ProjectContext, name: string, description: string) => {
    if (await isStoredOnDisk(utilityConfigFileName)) {
        console.error("directory already managed by verde!.");
        return;
    }

    if (context.utilitiesInCwd.length) {
        logger.fatal(
            "this directory contains sub utilities",
            "\n",
            context.utilitiesInCwd.map(u => `${u.configFile.name}: ${u.path}`).join("\n"),
        );
        return;
    }

    const { utilities } = context;
    const nameNotAvailable = utilities.some(u => u.configFile.name === name);

    if (nameNotAvailable) {
        console.error("name taken by a different utility.");
        return;
    }

    const paths = await collectFilePathsIn(".");

    const sortedPaths = paths
        .slice(0)
        .sort()
        .filter(p => basename(p) !== utilityConfigFileName);

    const files = await readFiles(sortedPaths);
    const hash = hashBuffersWithSha256(files);

    await storeJSON<UtilityFile>(utilityConfigFileName, {
        name: name,
        deps: {},
        private: false,
        hash,
        version: "0.1.0",
        description: description,
    });
};

export const removeUtilityFromProject = async (context: ProjectContext, name: string) => {
    for (const util of context.utilities) {
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

export const hideUtilityInProject = async (context: ProjectContext, name: string) => {
    const util = selectUtilityByName(context, name);

    if (!util) {
        console.error(`could not find utility with name ${name}`);
        return;
    }

    const nextUtilityFile = markUtilityFileAsPrivate(util.configFile);
    await storeJSON<UtilityFile>(join(util.path, utilityConfigFileName), nextUtilityFile);
    console.log("done!");
};

export const revealUtilityInProject = async (context: ProjectContext, name: string) => {
    const util = selectUtilityByName(context, name);

    if (!util) {
        console.error(`could not find utility with name ${name}`);
        return;
    }

    const nextUtilityFile = markUtilityAsPublic(util.configFile);
    await storeJSON<UtilityFile>(join(util.path, utilityConfigFileName), nextUtilityFile);
    console.log("done!");
};

export const checkUtility = async (context: ProjectContext, nameOrDesc: string | UtilityDescription) => {
    logger.log(`looking for utility "${nameOrDesc}"`);

    const util = typeof nameOrDesc === "string" ? selectUtilityByName(context, nameOrDesc) : nameOrDesc;

    if (!util) {
        logger.fatal(`could not find utility with name ${nameOrDesc}`);
        process.exit(1);
    }

    console.log(`found utility "${util.configFile.name}" computing it's file hash...`);

    const previousHash = util.configFile.hash || "";

    const utilFilePaths = util.files.filter(f => basename(f) !== utilityConfigFileName);
    const files = await readFiles(utilFilePaths);
    const currentHash = hashBuffersWithSha256(files);

    if (previousHash !== currentHash) {
        console.log(`${util.configFile.name} hash mismatch, updating on disk config file...`);
        await storeJSON<UtilityFile>(
            join(util.path, utilityConfigFileName),
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
        match: currentHash === previousHash,
    };
};

export const checkAllUtilities = async (context: ProjectContext) => {
    const { utilities } = context;
    const chunked = chunkArr(utilities, CPU_COUNT * 2);

    for (const chunk of chunked) {
        await Promise.all(chunk.map(c => checkUtility(context, c)));
    }
};

export const pushAllUtilities = async (context: ProjectContext) => {
    const chunked = chunkArr(context.utilities, CPU_COUNT * 2);

    for (const chunk of chunked) {
        await Promise.all(chunk.map(c => push_utility(context, c.configFile.name)));
    }
};

export const addConfigToProjectPackageFile = async (context: ProjectContext) => {
    await storeJSON<PackageFile>(join(context.path, "package.json"), context.packageFile);
    console.log("Your verde config: \n", JSON.stringify(context.packageFile.verde, undefined, 4));
};
