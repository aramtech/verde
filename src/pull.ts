import { rmSync } from "fs-extra";
import path from "path";
import { chunkArr } from "./array";
import { download_utility } from "./download_utility";
import { projectRoot, readJSON } from "./fs";
import { get_utility_versions } from "./github";
import logger from "./logger";
import { CPU_COUNT } from "./os";
import {
    assembleProjectContext,
    checkUtility,
    projectContext,
    selectUtilityByName,
    utilityConfigFileName,
    type DependencyDescription,
    type ProjectContext,
} from "./project";
import {
    collect_dependencies_list,
    compareVersions,
    get_remote_version_config_file,
    parseVersionOrExit,
    process_utility_identifier_input,
    type UtilityFile,
    type Version,
} from "./utility";

let processed_dependencies: string[] = [];
export const process_dependencies = async (
    deps: { [utility_name: string]: DependencyDescription },
    main_dependencies: boolean,
) => {
    const chunks = chunkArr(Object.entries(deps), CPU_COUNT * 4);
    for (const chunk of chunks) {
        await Promise.all(
            chunk.map(async ([utility_name, dependency_description]) => {
                if (processed_dependencies.includes(utility_name)) {
                    return;
                }
                processed_dependencies.push(utility_name);
                await pull_utility({
                    context: projectContext,
                    input_utility_name: `${dependency_description.owner}/${dependency_description.repo}`,
                    main_dep: main_dependencies,
                    version: dependency_description.version,
                    update_policy: dependency_description.update_policy,
                });
            }),
        );
    }
};

export const pull_utility = async ({
    context,
    input_utility_name,
    version,
    update_policy = "minor",
    main_dep,
}: {
    context: ProjectContext;
    input_utility_name: string;
    version?: string;
    main_dep: boolean;
    force?: boolean; 
    update_policy?: "major" | "minor" | "batch" | "fixed";
}) => {
    /**
     *  - check if the utility has remote version
     *    - if not prompt that this utility does not exist remotely
     *  - if there is version passed
     *    - check if the version exists remotely
     *    - if not prompt and exit
     *
     *   - specify required versoin either lts or specified
     *
     *  - check if the utility exists locally
     *  - if it does
     *    - compare versions of local to remote
     *      - if version specified
     *        - specified version != current
     *          - pull specified version into prompted utils dir path
     *      - else
     *        - if local greater
     *          - prompt you are up to date and exit
     *        - if local lower
     *          - pull specified version into prompted utils dir path
     *        - if local equals remote
     *          - prompt you are up to date and exit
     *  - if not
     *    - pull specified version into prompted utils dir path
     *
     */
    
    const {
        owner,
        repo,
        utility_current_owner_different_from_provided,
        utility_exists_on_project,
        utility_parent_dir_relative_path,
        utility_dir_name,
    } = await process_utility_identifier_input(input_utility_name);

    const versions = await get_utility_versions(owner, repo, true);
    if (!versions.length || !versions.at(-1)) {
        logger.error("Remote Utility is not detected, and have no versions", input_utility_name);
        return;
    }
    logger.log("Latest Version for util", `${repo}/${owner}`, versions?.at(-1)?.version);

    const utility_name = repo;
    const util = selectUtilityByName(context, utility_name);
    if(util){
        if(util.configFile.private){
            logger.log("utility",input_utility_name," exists on project and it is private")
            return
        }
        logger.log("utility", input_utility_name, "exists on the project at" , util?.path," with version",util?.configFile?.version )
    }
    const update_dependency_on_package_dot_json = async (selected_version: Version) => {
        if (!main_dep) {
            return;
        }
        projectContext.packageFile.verde.dependencies[utility_name] = {
            owner,
            repo,
            update_policy: update_policy,
            version: selected_version.version as any,
        };
    };

    const process_deps = async () => {
        const utility_full_path = path.join(projectRoot, utility_parent_dir_relative_path, utility_dir_name);
        
        const utility_config_file = readJSON<UtilityFile>(path.join(utility_full_path, utilityConfigFileName));
        if (utility_config_file) {
            await process_dependencies(utility_config_file.deps, false);
        }
    };
    const pull = async (selected_version: Version) => {
        logger.log("Pulling utility", input_utility_name, "with version", selected_version.version, ", and update policy is", update_policy)
        await download_utility(
            owner,
            utility_name,
            selected_version.version,
            utility_parent_dir_relative_path,
            utility_dir_name,
        );
        await process_deps();
        await update_dependency_on_package_dot_json(selected_version);
    };

    const up_to_date = async (selected_version: Version) => {
        logger.success("utility", utility_name, "Up to date" );
        await process_deps();
        await update_dependency_on_package_dot_json(selected_version);
        return;
    };

    const target_version: Version = parseVersionOrExit(
        version || util?.configFile.version || (versions.at(-1)?.version as string),
    );

    if (!util || (utility_exists_on_project && utility_current_owner_different_from_provided)) {
        logger.log("utility ", input_utility_name, "does not exist on the project and will be pulled with version", target_version.version)
        await pull(target_version);
        return;
    }

    const utilVersion = parseVersionOrExit(util.configFile.version);

    if (
        !versions.find(v => {
            return v.version == utilVersion.version;
        })
    ) {
        logger.warning(
            "utility ",
            util.configFile.name,
            "at",
            util.path,
            "current version",
            util.configFile.version,
            "does not exist remotely, please push",
        );
        return;
    }

    const check_result = await checkUtility(projectContext, util.configFile.name);
    util.configFile.hash = check_result.currentHash;

    // const remote_config_file_for_current_version = await get_remote_version_config_file(
    //     owner,
    //     repo,
    //     util.configFile.version,
    // );
    // if (remote_config_file_for_current_version) {
    //     if (remote_config_file_for_current_version.hash != util.configFile.hash) {
    //         logger.warning(
    //             "utility ",
    //             util.configFile.name,
    //             "at",
    //             util.path,
    //             "which has the lasted version of", 
    //             versions.at(-1)?.version, 
    //             "and locurrent version",
    //             util.configFile.version,
    //             "local hash does not math remote hash, please make sure to check then update the version and push",
    //         );
    //         return;
    //     }
    // }

    if (update_policy == "fixed") {
        const version = target_version.version;
        const found_version = versions.find(v => v.version == version);
        if (!found_version) {
            logger.fatal("Specified version", version, "is not found remotely");
            return;
        }
        const selected_version = found_version;
        logger.log("requesting specific version", version);

        if (!compareVersions(selected_version, "==", utilVersion)) {
            return await pull(selected_version);
        } else {
            return up_to_date(selected_version);
        }
    } else {
        let selected_version: Version = target_version as Version;
        if (update_policy == "major" || !util) {
            selected_version = versions.at(-1) as Version;
        } else if (update_policy == "minor") {
            const latest_minor_version = (versions
                .filter(v => {
                    return v.major <= target_version.major;
                })
                .at(-1) || versions.at(-1)) as Version;
            logger.log("selecting minor version for", input_utility_name, "with version", latest_minor_version)
            selected_version = latest_minor_version;
        } else if (update_policy == "batch") {
            const last_batch_version = (versions
                .filter(v => {
                    return (
                        (v.major == target_version.major && v.minor <= target_version.minor) ||
                        v.major < target_version.major
                    );
                })
                .at(-1) || versions.at(-1)) as Version;
            selected_version = last_batch_version;
        }

        if (compareVersions(selected_version, ">", utilVersion)) {
            await pull(selected_version);
        } else if (compareVersions(selected_version, "<", utilVersion)) {
            logger.warning("you local version is greater than remote latest, please push updates");
            return;
        } else {
            return up_to_date(selected_version);
        }
    }
};

export const pull_all_utilities = async ({ keep_excess_utilities = false }: { keep_excess_utilities?: boolean, force?: boolean }) => {
    const package_dot_json = projectContext.packageFile;
    const main_dependencies = package_dot_json.verde.dependencies;

    await process_dependencies(main_dependencies, true);

    if (!keep_excess_utilities) {
        const updated_context = await assembleProjectContext();
        const all_dependencies = await collect_dependencies_list(updated_context, main_dependencies);
        const excess = updated_context.utilities.filter(u => {
            return !all_dependencies[u.configFile.name];
        });
        const chunked_excess = chunkArr(excess, CPU_COUNT * 4);
        for (const excess_chunk of chunked_excess) {
            await Promise.all(
                excess_chunk.map(async util => {
                    const versions = await get_utility_versions(util.configFile.owner, util.configFile.name, true);
                    const found_version = versions.find(v => v.version == util.configFile.version);
                    if (!found_version) {
                        logger.warning(
                            "Utility",
                            util.configFile.owner + "/" + util.configFile.name,
                            "is not registered on main dependencies, and its current version does not exists remotely, please push to register it, or remove it manually.",
                        );
                        return;
                    }
                    if (found_version) {
                        const remote_config = await get_remote_version_config_file(
                            util.configFile.owner,
                            util.configFile.name,
                            found_version.version,
                        );
                        if (!remote_config) {
                            logger.warning(
                                "Utility",
                                util.configFile.owner + "/" + util.configFile.name,
                                " version",
                                found_version.version,
                                " is not registered on main dependencies but",
                                "has corrupt remote origin,  since its config file not found, to fix please push or fix it manually.",
                            );
                            return;
                        }

                        const check_result = await checkUtility(projectContext, util.configFile.name);
                        if (remote_config.hash != check_result.currentHash) {
                            logger.warning(
                                "Utility",
                                util.configFile.owner + "/" + util.configFile.name,
                                " version",
                                found_version.version,
                                " is not registered on main dependencies, ",
                                "its remote config hash does not match current hash, did you forgot to update its version and pushing after editing it?",
                            );
                            return;
                        }
                    }
                    logger.success(
                        "removing excess utility",
                        util.configFile.owner + "/" + util.configFile.name,
                        "at",
                        util.path,
                    );
                    rmSync(util.path, { recursive: true });
                }),
            );
        }
    }
};
