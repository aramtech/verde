export const chunkArr = <T>(arr: T[], chunkSize: number): T[][] => {
    let result: T[][] = [];
    let currentChunk: T[] = [];

    for (const item of arr) {
        currentChunk.push(item);

        if (currentChunk.length === chunkSize) {
            result = [...result, currentChunk];
            currentChunk = [];
        }
    }

    if (currentChunk.length) {
        result = [...result, currentChunk];
    }

    return result;
};
