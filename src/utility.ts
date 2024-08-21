import logger from "./logger";

export type UtilityFile = { name: string } & Partial<{
    version: string;
    deps: Record<string, string>;
    hash: string;
    private: boolean;
    description: string;
}>;

export const parseUtilityFileFromBuffer = (buff: Buffer) => {
    const parsed = JSON.parse(buff.toString("utf-8"));
    return parsed as UtilityFile;
};

export const validate_utility_version = (version: string) => {
    /**
     * make sure its a string comprized of three number joined by "."
     */
    const invalid_version = () => {
        logger.fatal(
            'Invalid version number, it should be string in the form of "<major version number>.<minor version number>.<batch version number>" for example "0.1.0"',
        );
    };

    if (typeof version != "string") {
        invalid_version();
    }

    const numbers = version
        .split(".")
        .map(n => Number(n))
        .filter(e => !Number.isNaN(e));

    if (numbers.length != 3) {
        invalid_version();
    }

    if (!version.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
        invalid_version();
    }

    return true;
};

export const validate_utility_name = (util_name: string) => {
    if (!util_name.match(/^[_\-a-zA-Z][_\-a-zA-Z0-9]{4,}$/)) {
        logger.fatal(
            'utility name is not valid it should only contain english characters and "_" or "-" and it should not start with number',
        );
    }
    return true;
};
