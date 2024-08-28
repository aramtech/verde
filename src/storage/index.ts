import fs from "fs-extra";
import path from "path";

import { CPU_COUNT, HOME_DIR_PATH } from "../os";
import { chunkArr } from "../array";

const VERDE_DIR_NAME = ".verde";

const getVerdeDirPath = () => path.join(HOME_DIR_PATH, VERDE_DIR_NAME);

export const maybeCreateVerdeDirAtHomeDir = () => {
    const storePath = getVerdeDirPath();

    if (!fs.existsSync(storePath)) {
        fs.mkdirSync(storePath);
    }
};

export const nameToPath = (filename: string) => path.join(getVerdeDirPath(), filename);

export const saveToFileStorage = async (name: string, buff: Buffer): Promise<void> => {
    const filepath = nameToPath(name);
    await fs.writeFile(filepath, buff);
};

export const getFileFromStorage = async (name: string): Promise<Buffer> => {
    const filepath = nameToPath(name);
    return await fs.readFile(filepath);
};

export const areFilesStored = async (...names: string[]): Promise<Record<string, boolean>> => {
    const paths = names.map(nameToPath);
    const chunkedPaths = chunkArr(paths, CPU_COUNT * 4);

    const result: Record<string, boolean> = {};

    for (const paths of chunkedPaths) {
        const checkResults: [string, boolean][] = await Promise.all(paths.map(async p => [p, await fs.exists(p)]));
        checkResults.forEach(([p, e]) => (result[p as string] = e));
    }

    return result;
};

export const isFileStored = async (name: string): Promise<boolean> => {
    return await fs.exists(nameToPath(name));
};

export const getStoredFileNames = async () => {
    const verdeDirPath = getVerdeDirPath();
    return await fs.readdir(verdeDirPath);
};

export const removeFilesFromStorage = async (...names: string[]): Promise<void> => {
    const paths = names.map(nameToPath);
    const chunkedPaths = chunkArr(paths, CPU_COUNT * 4);

    for (const paths of chunkedPaths) {
        await Promise.all(paths.map(async p => await fs.remove(p)));
    }
};

export const getStoredFilePath = (name: string) => nameToPath(name);

export const createStoredFileReader = (name: string) => {
    const path = nameToPath(name);
    return fs.createReadStream(path);
};

export const createStoredFileWriter = (name: string) => {
    const path = nameToPath(name);
    return fs.createWriteStream(path);
};
