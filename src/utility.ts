import { existsSync, statSync } from "fs-extra";
import path from "path";
import { projectRoot } from "./fs";
import { get_file_from_repo, type SingleGithubFile } from "./github";
import logger from "./logger";
import { get_default_owner, read_owner_name } from "./owner";
import { projectContext, selectUtilityByName, utilityConfigFileName, type DependencyDescription, type ProjectContext } from "./project";
import { readAnswerTo, requestPermsToRun } from "./prompt";
import { owner_utility_match_regex, utility_name_validation_regex, utility_version_validation_regex } from "./regex";

export type UtilityFile = { name: string } & {
    version: string;
    deps: Record<string, DependencyDescription>;
    hash: string;
    private: boolean;
    public_repo: boolean;
    description: string;
    owner: string;
};

export const get_remote_version_config_file = async (owner: string, repo: string, version: string)=>{
    const last_remote_config_file = (await get_file_from_repo(
        owner,
        repo,
        utilityConfigFileName,
        version,
    )) as SingleGithubFile | null;
    if (!last_remote_config_file) {
        logger.error("Error loading utility config file from remote source for utility (file not found)", {
            version: version,
            owner: owner,
            repo: repo,
        });
        return null; 
    } else {
        const remote_util_config: UtilityFile = JSON.parse(
            Buffer.from(last_remote_config_file.content, "base64").toString("utf-8"),
        );
        return remote_util_config
    }
}

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
    if (!raw.match(utility_version_validation_regex)) {
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
    return name.match(utility_name_validation_regex);
};


export const parseVersionOrExit = (v: string): Version => {
    const parsed = parseUtilityVersion(v);
    if (!parsed) {
        logger.fatal(`${v} is not a valid version.`);
    }
    return parsed as Version;
};

export type UtilityDescription = {
    configFile: UtilityFile;
    path: string;
    files: string[];
};
const processed_utility_identifier_inputs: {
    [identifier: string]: {
        owner: string;
        repo: string;
        utility_current_owner_different_from_provided: boolean;
        utility_exists_on_project: boolean;
        utility_parent_dir_relative_path: string; 
    }
} = {}
export const process_utility_identifier_input = async (input: string) => {
    
    if(processed_utility_identifier_inputs[input]){
        return processed_utility_identifier_inputs[input]
    }
    let owner: string;
    let repo: string;
    let utility_exists_on_project: boolean = false;
    let utility_current_owner_different_from_provided: boolean = false;
    const owner_and_repo_match = input.match(owner_utility_match_regex);
    let specified_owner = false;
    if (owner_and_repo_match) {
        owner = owner_and_repo_match[1];
        repo = owner_and_repo_match[2];
        specified_owner = true; 
        const utility = selectUtilityByName(projectContext, repo);
        if (utility) {
            utility_exists_on_project = true;
            if (utility.configFile.owner != owner) {
                utility_current_owner_different_from_provided = true;
                const overrideOwner = await requestPermsToRun(
                    `utility ${repo} exists on the system with different owner "${utility.configFile.owner}" than the one you entered "${owner}" do you want to override it and use the owner you inputted`,
                );
                if (!overrideOwner) {
                    utility_current_owner_different_from_provided = false;
                    owner = utility.configFile.owner;
                }
            }
        }
    } else if (input.match(utility_name_validation_regex)) {
        repo = input;

        const utility = selectUtilityByName(projectContext, repo);
        if (utility) {
            owner = utility.configFile.owner;
            if(!owner){
                logger.fatal("utility ", utility.configFile.name, " has no specified owner.", "please go to ", path.join(utility.path, utilityConfigFileName), "and add owner")
            }
            utility_exists_on_project = true;
        } else {
            const default_owner = get_default_owner();
            if (default_owner) {
                logger.log("using default owner in package.json:", default_owner);
                owner = default_owner;
            } else {
                owner = await read_owner_name({ do_not_check_if_owner_exists: true });
            }
        }
    } else {
        logger.fatal(
            "invalid utility identifier, it should be in the form of <utility name> or <owner name>/<utility name>",
        );
        process.exit(1);
    }
    let utility_parent_dir_relative_path: string; 

    const group = projectContext.packageFile.verde.grouping.find(g=>repo.startsWith(g.prefix))
    if(group){
        if(!specified_owner){
            owner = group.owner
        }
        utility_parent_dir_relative_path = group.installationDestination
    }else{
        if(projectContext.packageFile.verde.defaultInstallationPath){
            utility_parent_dir_relative_path = projectContext.packageFile.verde.defaultInstallationPath
        }else{
            utility_parent_dir_relative_path = await read_installation_path()
        }
    }
        
    const installation_full_path = path.join(projectRoot, utility_parent_dir_relative_path)

    if(!existsSync(installation_full_path)){
        logger.fatal("Specified Installation path does not exist")
    }
    if(!statSync(installation_full_path).isDirectory()){
        logger.fatal("Specified Installation path is not a directory")
    }

    const result =  { owner, repo ,utility_current_owner_different_from_provided, utility_exists_on_project,utility_parent_dir_relative_path  };
    processed_utility_identifier_inputs[input] = result; 
    return result; 
};

const read_installation_path = async ()=>{
    const answer = await readAnswerTo("where do you want to install this utility")
    return answer
}

export const collect_dependencies_list = async (
    context: ProjectContext,
    dependency_list: {
        [utility: string]: DependencyDescription;
    },
) => {
    let deps: {
        [utility: string]: DependencyDescription;
    } = {};
    for (const dep in dependency_list) {
        deps[dep] = dependency_list[dep];

        const utility = selectUtilityByName(context, dep);
        if (utility) {
            deps = { ...deps, ...(await collect_dependencies_list(context, utility.configFile.deps)) };
        }
    }
    return deps;
};