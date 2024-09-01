import path from "path";
import { hashBuffersWithSha256 } from "./crypto";
import { collectFilePathsIn, isStoredOnDisk, readFiles, storeJSON } from "./fs";
import logger from "./logger";
import { projectContext, utilityConfigFileName } from "./project";
import { requestPermsToRun } from "./prompt";
import { process_utility_identifier_input, type UtilityFile } from "./utility";

export const initNewUtility = async (name: string, description: string) => {
    const context = projectContext;
    const { owner, repo: utility_name } = await process_utility_identifier_input(name);

    if (await isStoredOnDisk(utilityConfigFileName)) {
        logger.fatal("directory already managed by verde!.");
        return;
    }

    if (context.utilitiesInCwd.length) {
        logger.fatal(
            "this directory contains sub utilities",
            "\n",
            context.utilitiesInCwd.map(u => `${u.configFile.name}: ${u.path}`).join("\n"),
        );
        return;
    }

    const { utilities } = context;
    const nameNotAvailable = utilities.some(u => u.configFile.name === name);

    if (nameNotAvailable) {
        console.error("name taken by a different utility.");
        return;
    }

    const paths = await collectFilePathsIn(".");

    const sortedPaths = paths
        .slice(0)
        .sort()
        .filter(p => path.basename(p) !== utilityConfigFileName);

    const files = await readFiles(sortedPaths);
    const hash = hashBuffersWithSha256(files);

    await storeJSON<UtilityFile>(utilityConfigFileName, {
        name: utility_name,
        deps: {},
        public_repo: await requestPermsToRun("Is this utility repo public"),
        private: false,
        hash,
        owner: owner,
        version: "0.1.0",
        description: description,
    });
};
