import logger from "./logger";

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

export const validate_utility_version = (version: string, kill = true): ParsedVersion => {
    /**
     * make sure its a string comprized of three number joined by "."
     */
    const invalid_version = () => {
        if (kill) {
            logger.fatal(
                'Invalid version number, it should be string in the form of "<major version number>.<minor version number>.<batch version number>" for example "0.1.0"',
            );
        }
        throw Error("invalid version: " + version);
    };

    if (typeof version != "string") {
        return invalid_version();
    }

    const numbers = version
        .split(".")
        .map(n => Number(n))
        .filter(e => !Number.isNaN(e));

    if (numbers.length != 3) {
        return invalid_version();
    }

    if (!version.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
        return invalid_version();
    }

    return {
        version: version,
        major: numbers[0],
        minor: numbers[1],
        batch: numbers[2],
        combined: get_combined(version),
    };
};
export const get_combined = (version: string) => {
    return Number(version.split(".").join(""));
};
export const validate_utility_name = (util_name: string) => {
    if (!util_name.match(/^[_\-a-zA-Z][_\-a-zA-Z0-9]{4,}$/)) {
        logger.fatal(
            'utility name is not valid it should only contain english characters and "_" or "-" and it should not start with number',
        );
    }
    return true;
};
export const markUtilityFileAsPrivate = (f: UtilityFile): UtilityFile => ({ ...f, private: true });

export const markUtilityAsPublic = (f: UtilityFile): UtilityFile => ({ ...f, private: false });

export const updateUtilityHash = (f: UtilityFile, nextHash: string): UtilityFile => ({ ...f, hash: nextHash });
