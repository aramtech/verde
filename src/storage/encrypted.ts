import fs from "fs-extra";
import { decryptBufferWithPassword, encryptBufferWithPassword } from "../crypto";
import { nameToPath } from "./index";
import Logger from "../logger";

export const encryptAndSaveFileToStorage = async (name: string, contents: Buffer, password: string) => {
    const encrypted = encryptBufferWithPassword(contents, password);
    const prefixedName = `encrypted-${name}`;
    const path = nameToPath(prefixedName);

    await fs.writeFile(path, encrypted);
};

export const retrieveEncryptedFileFromStorage = async (name: string, password: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = nameToPath(prefixedName);

    const fileDoesNotExist = !(await fs.exists(path));

    if (fileDoesNotExist) {
        return null;
    }

    try {
        const encryptedContents = await fs.readFile(path);
        return Buffer.from(decryptBufferWithPassword(encryptedContents, password));
    } catch (err) {
        Logger.error("failed to decrypt file: ", name, ":", err);
        return null;
    }
};

export const isStoredAsEncrypted = async (name: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = nameToPath(prefixedName);

    return await fs.exists(path);
};
