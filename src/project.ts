import axios from "axios";
import { existsSync } from "fs-extra";
import { basename, join } from "path";
import { chunkArr } from "./array";
import { hashBuffersWithSha256 } from "./crypto";
import {
    collectDirsWithFile,
    findProjectRoot,
    projectRoot,
    readFiles,
    readJSON,
    removeDir,
    storeJSON
} from "./fs";
import logger from "./logger";
import { CPU_COUNT } from "./os";
import { readAnswerTo } from "./prompt";
import { type UtilityDescription, type UtilityFile, markUtilityAsPublic, markUtilityFileAsPrivate, updateUtilityHash, utilityConfigFileName } from "./utility";


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
    dependencies: Record<string, DependencyDescription>;
    defaultInstallationPath: string;
    defaultOrg: string | null;
    grouping: Array<{
        prefix: string;
        installationDestination: string;
        owner: string;
    }>;
};

export type DependencyDescription = {
    owner: string;
    repo: string;
    version: `${number}.${number}.${number}`;
    update_policy: "major" | "minor" | "batch" | "fixed";
};

export type PackageDotJSONFile = {
    name: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    verde: VerdeConfig;
};

export type ProjectContext = {
    utilities: UtilityDescription[];
    utilitiesInCwd: UtilityDescription[];
    path: string;
    packageFile: PackageDotJSONFile;
};

export const selectUtilityByName = (ctx: ProjectContext, name: string): UtilityDescription | undefined =>
    ctx.utilities.find(u => u.configFile.name === name);

const getDefaultInstallationRelativePath = async () => {
    let answer = await readAnswerTo("where do you want installations [server/utils]", {
        type: "input",
    });
    if (!answer) {
        answer = "server/utils";
    }
    const directoryFullPath = join(projectRoot, answer);
    if (!existsSync(directoryFullPath)) {
        logger.fatal("provided default installation path is not valid and does not exists on the current project");
    }
    return answer;
};

export const getDefaultOrganizationPath = async () => {
    try {
        const answer = await readAnswerTo("what is the default Organization/Owner Name to look in");
        if (!answer.match(/^[0-9a-zA-Z][_\-0-9a-zA-Z]*?$/)) {
            logger.fatal("Organization/Owner Name Is not Valid");
        }
        await axios.get(`https://github.com/${answer}`);
    } catch (error: any) {
        if (error?.status == 404) {
            logger.fatal("Provided Organization Does not exists");
        }
        logger.fatal("Error", error);
        return "";
    }
};

export const assembleProjectContext = async (pathOrCwd: string = process.cwd()): Promise<ProjectContext> => {
    const utilities = await listUtilitiesInDirectory(projectRoot);
    const utilitiesInCwd = projectRoot === pathOrCwd ? utilities : await listUtilitiesInDirectory(pathOrCwd);
    const packageFile = readJSON<PackageDotJSONFile>(join(projectRoot, "package.json"));
    packageFile.verde.grouping = packageFile.verde.grouping.sort((gA, gB)=>{
        if(gA.prefix.length > gB.prefix.length){
            return 1
        } else if(gA.prefix.length < gB.prefix.length){
            return -1
        }else{
            return 0
        }
    })

    if (packageFile.verde === undefined) {
        const verde: VerdeConfig = {
            defaultInstallationPath: await getDefaultInstallationRelativePath(),
            dependencies: {},
            grouping: [],
            defaultOrg: null,
        };

        const packageFileWithVerde = {
            ...packageFile,
            verde,
        };

        await storeJSON(join(projectRoot, "package.json"), packageFileWithVerde);

        return {
            utilities,
            utilitiesInCwd,
            path: projectRoot,
            packageFile: packageFileWithVerde,
        };
    }

    return {
        utilities,
        utilitiesInCwd,
        packageFile,
        path: projectRoot,
    };
};
export const projectContext = await assembleProjectContext();

export const removeUtilityFromProject = async (context: ProjectContext, name: string) => {
    for (const util of context.utilities) {
        if (util.configFile.name === name) {
            logger.log("found utility file, deleting...");
            await removeDir(util.path);
            return;
        }
    }
};

export const getUtilityByName = async (name: string): Promise<UtilityDescription | undefined> => {
    const projectRoot = await findProjectRoot();
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
export const addConfigToProjectPackageFile = async (context: ProjectContext) => {
    await storeJSON<PackageDotJSONFile>(join(context.path, "package.json"), context.packageFile);
    logger.log("Your verde config: \n", JSON.stringify(context.packageFile.verde, undefined, 4));
};
