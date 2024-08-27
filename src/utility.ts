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

export type Version = {
    version: string;
    major: number;
    minor: number;
    patch: number;
    combined: number;
};

export const parseUtilityVersion = (raw: string): Version | null => {
    if (!raw.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
        return null;
    }

    const numbers = raw
        .split(".")
        .map(n => Number(n))
        .filter(e => !Number.isNaN(e));

    if (numbers.length !== 3) {
        return null;
    }

    return {
        version: raw,
        major: numbers[0],
        minor: numbers[1],
        patch: numbers[2],
        combined: Number(numbers.join("")),
    };
};

export const compareVersions = (v1: Version, op: "==" | ">" | "<" | ">=" | "<=", v2: Version) => {
    if (op == "<") {
        if (v1.major != v2.major) {
            return v1.major < v2.major;
        }
        if (v1.minor != v2.minor) {
            return v1.minor < v2.minor;
        }
        return v1.patch < v2.patch;
    }

    if (op == "<=") {
        if (v1.major != v2.major) {
            return v1.major <= v2.major;
        }
        if (v1.minor != v2.minor) {
            return v1.minor <= v2.minor;
        }
        return v1.patch <= v2.patch;
    }

    if (op == "==") {
        return v1.version == v2.version;
    }

    if (op == ">=") {
        if (v1.major != v2.major) {
            return v1.major >= v2.major;
        }
        if (v1.minor != v2.minor) {
            return v1.minor >= v2.minor;
        }
        return v1.patch >= v2.patch;
    }

    if (v1.major != v2.major) {
        return v1.major > v2.major;
    } else if (v1.minor != v2.minor) {
        return v1.minor > v2.minor;
    }

    return v1.patch > v2.patch;
};

export const isUtilityNameValid = (name: string) => {
    return name.match(/^[_\-a-zA-Z][_\-a-zA-Z0-9]{4,}$/);
};

export const markUtilityFileAsPrivate = (f: UtilityFile): UtilityFile => ({ ...f, private: true });

export const markUtilityAsPublic = (f: UtilityFile): UtilityFile => ({ ...f, private: false });

export const updateUtilityHash = (f: UtilityFile, nextHash: string): UtilityFile => ({ ...f, hash: nextHash });
