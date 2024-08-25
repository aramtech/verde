import fs from "fs-extra";
import path from "path";

import { HOME_DIR_PATH } from "./os";

const VERDE_DIR_NAME = ".verde";

const getVerdeDirPath = () => path.join(HOME_DIR_PATH, VERDE_DIR_NAME);

const createStorageDirectoryIfNotExists = () => {
    const storePath = getVerdeDirPath();

    if (!fs.existsSync(storePath)) {
        fs.mkdirSync(storePath);
    }
};

const nameToPath = (filename: string) => path.join(getVerdeDirPath(), filename);

export const saveToFileStorage = async (name: string, buff: Buffer): Promise<void> => {
    createStorageDirectoryIfNotExists();

    const filepath = nameToPath(name);
    await fs.writeFile(filepath, buff);
};

export const getFileFromStorage = async (name: string): Promise<Buffer> => {
    createStorageDirectoryIfNotExists();

    const filepath = nameToPath(name);
    return await fs.readFile(filepath);
};

export const isStored = async (name: string): Promise<boolean> => {
    createStorageDirectoryIfNotExists();
    return await fs.exists(nameToPath(name));
};

export const getStoredFiles = async () => {
    createStorageDirectoryIfNotExists();
    const verdeDirPath = getVerdeDirPath();
    return await fs.readdir(verdeDirPath);
};
