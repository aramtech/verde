import Logger from "../logger";
import {
    createStoredFileReader,
    createStoredFileWriter,
    getStoredFileNames,
    getStoredFilePath,
    removeFilesFromStorage,
    saveToFileStorage,
} from "./index";

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

export const isFileCached = async (name: string) => {
    const prefixedName = prefixName(name);
    const allFilesInStorage = await getStoredFileNames();
    const cachedFiles = allFilesInStorage.filter(isCacheEntry);

    return cachedFiles.some(n => n === prefixedName);
};

export const getCachedFilePath = (name: string) => {
    const prefixedName = prefixName(name);
    return getStoredFilePath(prefixedName);
};

export const createCachedFileReader = (name: string) => {
    const prefixedName = prefixName(name);
    return createStoredFileReader(prefixedName);
};

export const createCacheWriteStream = (name: string) => {
    const prefixedName = prefixName(name);
    return createStoredFileWriter(prefixedName);
};
