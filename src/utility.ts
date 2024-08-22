export type UtilityFile = { name: string } & {
    version: string;
    deps: Record<string, string>;
    hash: string;
    private: boolean;
    description: string;
};

export const parseUtilityFileFromBuffer = (buff: Buffer) => {
    const parsed = JSON.parse(buff.toString("utf-8"));
    return parsed as UtilityFile;
};

export type ParsedVersion = {
    version: string;
    major: number;
    minor: number;
    batch: number;
    combined: number;
};

export const parseUtilityVersion = (version: string): ParsedVersion | null => {
    if (!version.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
        return null;
    }

    const numbers = version
        .split(".")
        .map(Number)
        .filter(e => !Number.isNaN(e));

    return {
        version: version,
        major: numbers[0],
        minor: numbers[1],
        batch: numbers[2],
        combined: Number(numbers.join("")),
    };
};

export const isUtilityNameValid = (util_name: string) => !util_name.match(/^[_\-a-zA-Z][_\-a-zA-Z0-9]{4,}$/);

export const markUtilityFileAsPrivate = (f: UtilityFile): UtilityFile => ({ ...f, private: true });

export const markUtilityAsPublic = (f: UtilityFile): UtilityFile => ({ ...f, private: false });

export const updateUtilityHash = (f: UtilityFile, nextHash: string): UtilityFile => ({ ...f, hash: nextHash });
