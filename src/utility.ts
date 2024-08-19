export type UtilityFile = { name: string } & Partial<{
    version: string;
    deps: Record<string, string>;
    hash: string;
}>;

export const parseUtilityFileFromBuffer = (buff: Buffer) => {
    const parsed = JSON.parse(buff.toString("utf-8"));
    return parsed as UtilityFile;
};
