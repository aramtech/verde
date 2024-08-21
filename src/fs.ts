import fs from "fs/promises";
import path from "path";
import logger from "./logger";

export type CollectOpts = {
    configFilename: string;
    exclude: string[];
};

export type CollectResult = {
    dirname: string;
    dirPath: string;
    contents: string[];
};

export const collectFilePathsIn = async (dir: string) => {
    const contents = await fs.readdir(dir);
    let results: string[] = [];

    for (const c of contents) {
        const stats = await fs.stat(path.join(dir, c));

        if (stats.isDirectory()) {
            const gotten = await collectFilePathsIn(path.join(dir, c));
            results.push(...gotten);
            continue;
        }

        results.push(path.join(dir, c));
    }

    return results;
};

export const collectDirsWithFile = async (initialPath: string, opts: CollectOpts): Promise<CollectResult[]> => {
    const { exclude, configFilename } = opts;
    const basename = path.basename(initialPath);

    if (exclude.find(e => initialPath.includes(e))) {
        return [];
    }

    const pathStats = await fs.stat(initialPath);

    if (!pathStats.isDirectory()) {
        return [];
    }

    const contents = await fs.readdir(initialPath);

    if (contents.find(x => x === configFilename)) {
        const fullContents = await collectFilePathsIn(initialPath);
        return [{ dirname: basename, contents: fullContents, dirPath: initialPath }];
    }

    let results: CollectResult[] = [];

    for (const c of contents) {
        const fullPath = path.join(initialPath, c);
        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
            const gotten = await collectDirsWithFile(fullPath, opts);
            results = [...results, ...gotten];
        }
    }

    return results;
};

export const readFiles = async (paths: string[]) => await Promise.all(paths.map(f => fs.readFile(f)));

export const storeObjectInCwd = async <T>(nameOrPath: string, object: T) =>
    await fs.writeFile(nameOrPath, JSON.stringify(object));

export const isStoredOnDisk = async (nameOrPath: string) => await fs.exists(nameOrPath);

export const readJSON = async <T>(path: string) => {
    const contents = await fs.readFile(path);
    return JSON.parse(contents.toString("utf-8")) as T;
};

export const removeDir = async (p: string) => await fs.rmdir(p, { recursive: true });


let project_root: null | string = null;
export async function find_project_root(currentDir = path.resolve(".")) {
    if (project_root) {
        return project_root;
    }

    const packagePath = path.join(currentDir, "package.json");

    if (await fs.exists(packagePath)) {
        project_root = currentDir;
        return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
        logger.fatal("No package.json file found in any parent directory.");
    }

    return find_project_root(parentDir);
}
