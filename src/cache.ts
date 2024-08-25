import Logger from "./logger";
import { getStoredFileNames, removeFilesFromStorage } from "./storage";

export const listCachedItems = async () => {
    Logger.log("Reading cache entries");

    const names = await getStoredFileNames();

    for (const name of names) {
        Logger.log(`Found entry with name: ${name}`);
    }
};

const isCacheEntry = (name: string) => name.startsWith("cache-");

export const clearCachedItems = async () => {
    const names = await getStoredFileNames();
    const cacheSpecificNames = names.filter(isCacheEntry);

    await removeFilesFromStorage(...cacheSpecificNames);
};
