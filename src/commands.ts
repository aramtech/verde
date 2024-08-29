import type { Command } from "commander";
import { deleteBranchOnFailure, get_utility_versions } from "./github";
import { getUtilityByName, projectContext } from "./project";

import { clearCachedItems, listCachedItems } from "./cache";
import { updatePackageDotJson } from "./fs";
import { initNewUtility } from "./init";
import logger from "./logger";
import {
    addConfigToProjectPackageFile,
    checkAllUtilities,
    checkUtility,
    hideUtilityInProject,
    removeUtilityFromProject,
    revealUtilityInProject,
} from "./project";
import { pull_all_utilities, pull_utility } from "./pull";
import { push_utility, pushAllUtilities } from "./push";
import { parseUtilityVersion, process_utility_identifier_input, type Version } from "./utility";

const context = projectContext;

const addConfigCommandToProgram = (program: Command) =>
    program.command("config").action(async () => {
        addConfigToProjectPackageFile(context);
    });

const addListToProgram = (program: Command) =>
    program.command("list").action(async () => {
        if (context.utilities.length === 0) {
            console.warn("no tool found!.");
            return;
        }

        for (const config of context.utilities) {
            logger.log("Tool found: ", config.configFile.name);
        }
    });

const addInitCommand = (program: Command) =>
    program
        .command("init <name>")
        .option("-d, --description <description>")
        .action(async (p, { description = "" }) => {
            await initNewUtility(p, description.trim());
        });

const addRemoveUtilityCommand = (program: Command) =>
    program.command("remove <name>").action(async p => {
        await removeUtilityFromProject(projectContext, p);
    });

const addPushUtilityCommand = (program: Command) =>
    program.command("push [name]").action(async (utility_name?: string) => {
        if (utility_name) {
            logger.log("pushing single");
            await push_utility({
                context: projectContext, 
                input_utility_name: utility_name, 
                main_dep: true, 
            });
            updatePackageDotJson() 
            return;
        }

        await pushAllUtilities(context);
        updatePackageDotJson() 
    });

const addHideCommand = (program: Command) =>
    program.command("hide <name>").action(async name => {
        await hideUtilityInProject(context, name);
    });

const addRevealCommand = (program: Command) =>
    program.command("reveal <name>").action(async name => {
        await revealUtilityInProject(context, name);
    });

const addCheckCommand = (program: Command) =>
    program.command("check [name]").action(async (name?: string) => {
        if (name) {
            await checkUtility(context, name);
            return;
        }

        await checkAllUtilities(context);
    });

const addDeleteBranchVersion = (program: Command) =>
    program.command("delete-version <utility_name> <version>").action(async (input, version: string) => {
        const { owner, repo } = await process_utility_identifier_input(input);

        if (!parseUtilityVersion(version)) {
            logger.fatal(`${version} is not a valid version`);
            return;
        }

        const utility_available_versions = await get_utility_versions(owner, repo);
        const found_version = utility_available_versions.find(v => (v as Version).version == version);
        if (!found_version) {
            logger.fatal("Version is not found");
            return;
        }
        await deleteBranchOnFailure(owner, repo, version);
    });

const addPullCommand = (program: Command) =>
    program
        .command("pull [name]")
        .option("-k, --keep-excess-utilities")
        .option("-v, --version <version>")
        .action(
            async (
                name: string | undefined,
                options: {
                    version?: string;
                    keepExcessUtilities: boolean;
                },
            ) => {
                const { version } = options;

                if (version && !parseUtilityVersion(version)) {
                    logger.fatal(`${version} is not a valid version`);
                    return;
                }

                if (name) {
                    const { owner, repo } = await process_utility_identifier_input(name);
                    const packageDotJSONFile = projectContext.packageFile;
                    let update_policy: "major" | "minor" | "fixed" | "batch" = "minor";
                    let target_version: string | undefined = undefined; 
                    if (packageDotJSONFile.verde.dependencies[repo]) {
                        update_policy = packageDotJSONFile.verde.dependencies[repo].update_policy;
                        target_version = packageDotJSONFile.verde.dependencies[repo].version
                    }
                    await pull_utility({
                        main_dep: true,
                        context: projectContext,
                        input_utility_name: name,
                        version: version || target_version,
                        update_policy: version ? "fixed" : update_policy,
                    });
                    updatePackageDotJson() 
                    return;
                }

                await pull_all_utilities({ keep_excess_utilities: !!options.keepExcessUtilities });
                updatePackageDotJson() 
            },
        );

const addListUtilityVersions = (program: Command) => {
    program.command("list-versions <utility_name>").action(async (utility_name: string) => {
        const { owner, repo } = await process_utility_identifier_input(utility_name);
        const util = await getUtilityByName(repo);

        if (!util) {
            logger.fatal("Utility not found");
            return;
        }

        const versions = await get_utility_versions(owner, util.configFile.name);

        const found_version = versions.find(v => (v as Version).version == util.configFile.version);

        if (!found_version) {
            logger.success("current version is not found remotely: ", util.configFile.version);
        } else if (!versions.length) {
            logger.warning("\nthis utility has no releases.");
        }

        for (const version of versions as Version[]) {
            logger.log(version.version == util.configFile.version ? `[${version.version}]` : `${version.version}`);
        }
    });
};

const addCacheCommands = (program: Command) =>
    program
        .command("cache [action]")
        .description("cache control command")
        .action(async (action: "list" | "clear" | string = "list") => {
            if (action === "clear") {
                await clearCachedItems();
                return;
            }

            await listCachedItems();
        });

export const addCommands = (program: Command) => {
    addInitCommand(program);
    addListToProgram(program);
    addRemoveUtilityCommand(program);
    addPushUtilityCommand(program);
    addPullCommand(program);
    addHideCommand(program);
    addRevealCommand(program);
    addCheckCommand(program);
    addListUtilityVersions(program);
    addDeleteBranchVersion(program);
    addConfigCommandToProgram(program);
    addCacheCommands(program);

    return program;
};
