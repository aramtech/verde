import Logger from "./logger";
import { getStoredFileNames, removeFilesFromStorage, saveToFileStorage } from "./storage";

const isCacheEntry = (name: string) => name.startsWith("cache-");

const prefixName = (name: string) => `cache-${name}`;

const removePrefix = (name: string) => name.replace(/^cache-/, "");

export const listCachedItems = async () => {
    Logger.log("Reading cache entries");

    const names = await getStoredFileNames();
    const cacheSpecificNames = names.filter(isCacheEntry).map(removePrefix);

    for (const name of cacheSpecificNames) {
        Logger.log(`Found entry with name: ${name}`);
    }
};

export const clearCachedItems = async () => {
    const names = await getStoredFileNames();
    const cacheSpecificNames = names.filter(isCacheEntry);

    await removeFilesFromStorage(...cacheSpecificNames);
};

export const cache = async (name: string, contents: string) => {
    const nameWithPrefix = prefixName(name);
    await saveToFileStorage(nameWithPrefix, contents);
};
