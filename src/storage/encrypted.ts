import fs from "fs-extra";
import { decryptStringWithPassword, encryptStringWithPassword } from "../crypto";
import Logger from "../logger";
import { fileNameToPath } from "./index";

export const encryptAndSaveFileToStorage = async (name: string, contents: string, password: string) => {
    const encrypted = encryptStringWithPassword(contents, password);
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    await fs.writeFile(path, encrypted);
};

export const retrieveEncryptedFileFromStorage = async (name: string, password: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    const fileDoesNotExist = !(await fs.exists(path));

    if (fileDoesNotExist) {
        return null;
    }

    try {
        const encryptedContents = await fs.readFile(path, "utf-8");
        return decryptStringWithPassword(encryptedContents, password);
    } catch (err) {
        Logger.error("failed to decrypt file: ", name, ":", err);
        return null;
    }
};

export const isStoredAsEncrypted = async (name: string) => {
    const prefixedName = `encrypted-${name}`;
    const path = fileNameToPath(prefixedName);

    return await fs.exists(path);
};
