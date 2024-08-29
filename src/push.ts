import { chunkArr } from "./array";
import { deleteBranchOnFailure, get_file_from_repo, get_utility_versions, type SingleGithubFile } from "./github";
import logger from "./logger";
import { CPU_COUNT } from "./os";
import { checkUtility, projectContext, type ProjectContext } from "./project";
import { get_token } from "./tokens";
import {
    collect_dependencies_list,
    compareVersions,
    isUtilityNameValid,
    parseUtilityVersion,
    parseVersionOrExit,
    process_utility_identifier_input,
} from "./utility";

import { Octokit } from "@octokit/rest";
import { readFile } from "fs-extra";
import path from "path";
import { collectFilePathsIn } from "./fs";

export const upload_dir_octo = async (
    org_name: string,
    repo_name: string,
    token: string,
    branch: string,
    directory_full_path: string,
) => {
    // There are other ways to authenticate, check https://developer.github.com/v3/#authentication
    const octo = new Octokit({
        auth: token,
    });
    // For this, I was working on a organization repos, but it works for common repos also (replace org for owner)
    const ORGANIZATION = org_name;
    const REPO = repo_name;
    console.log("listing repos for org", ORGANIZATION);
    const repos = await octo.repos.listForOrg({
        org: ORGANIZATION,
        type: "all",
        per_page: 10e4,
    });
    console.log(
        "looking for repo",
        repo_name,
        "in",
        repos.data.map((repo: any) => repo.name).filter(r => r.startsWith("rest")),
    );
    if (!repos.data.map((repo: any) => repo.name).includes(REPO)) {
        console.log("creating repo since its not found");
        await createRepo(octo, ORGANIZATION, REPO);
    }
    /**
     * my-local-folder has files on its root, and subdirectories with files
     */
    console.log("uploading to repo");
    await uploadToRepo(octo, directory_full_path, ORGANIZATION, REPO, branch);
};

const createRepo = async (octo: Octokit, org: string, name: string) => {
    await octo.repos.createInOrg({ org, name, auto_init: true });
};

const uploadToRepo = async (octo: Octokit, coursePath: string, org: string, repo: string, branch: string) => {
    // gets commit's AND its tree's SHA
    console.log("getting current commit");
    const currentCommit = await getCurrentCommit(octo, org, repo);
    console.log("collect file paths");
    const filesPaths = await collectFilePathsIn(coursePath);
    console.log("creating blobs");
    const filesBlobs = await Promise.all(filesPaths.map(createBlobForFile(octo, org, repo)));
    console.log("calculating relative paths");
    const pathsForBlobs = filesPaths.map(fullPath => path.relative(coursePath, fullPath));
    console.log("creating tree");
    const newTree = await createNewTree(octo, org, repo, filesBlobs, pathsForBlobs, currentCommit.treeSha);
    console.log("creating new commit");
    const commitMessage = `branch: ${branch}`;
    const newCommit = await createNewCommit(octo, org, repo, commitMessage, newTree.sha, currentCommit.commitSha);
    console.log("setting branch to commit");

    await octo.git.createRef({
        owner: org,
        repo,
        ref: `refs/heads/${branch}`,
        sha: newCommit.sha,
    });
};

const getCurrentCommit = async (octo: Octokit, org: string, repo: string, branch: string = "main") => {
    const { data: refData } = await octo.git.getRef({
        owner: org,
        repo,
        ref: `heads/${branch}`,
    });
    const commitSha = refData.object.sha;
    const { data: commitData } = await octo.git.getCommit({
        owner: org,
        repo,
        commit_sha: commitSha,
    });
    return {
        commitSha,
        treeSha: commitData.tree.sha,
    };
};

// Notice that readFile's utf8 is typed differently from Github's utf-8
const getFileAsUTF8 = (filePath: string) => readFile(filePath, "utf8");

const createBlobForFile = (octo: Octokit, org: string, repo: string) => async (filePath: string) => {
    const content = await getFileAsUTF8(filePath);
    const blobData = await octo.git.createBlob({
        owner: org,
        repo,
        content,
        encoding: "utf-8",
    });
    return blobData.data;
};

const createNewTree = async (
    octo: Octokit,
    owner: string,
    repo: string,
    blobs: any[],
    paths: string[],
    parentTreeSha: string,
) => {
    // My custom config. Could be taken as parameters
    const tree = blobs.map(({ sha }, index) => ({
        path: paths[index],
        mode: `100644`,
        type: `blob`,
        sha,
    })) as any[];
    const { data } = await octo.git.createTree({
        owner,
        repo,
        tree,
        base_tree: parentTreeSha,
    });
    return data;
};

const createNewCommit = async (
    octo: Octokit,
    org: string,
    repo: string,
    message: string,
    currentTreeSha: string,
    currentCommitSha: string,
) =>
    (
        await octo.git.createCommit({
            owner: org,
            repo,
            message,
            tree: currentTreeSha,
            parents: [currentCommitSha],
        })
    ).data;

const setBranchToCommit = async (
    octo: Octokit,
    org: string,
    repo: string,
    branch: string = `main`,
    commitSha: string,
) =>
    await octo.git.updateRef({
        owner: org,
        repo,
        ref: `refs/heads/${branch}`,
        sha: commitSha,
        force: true,
    });

export const push_utility = async ({
    main_dep,
    context,
    input_utility_name,
}: {
    context: ProjectContext;
    input_utility_name: string;
    main_dep: boolean;
}) => {
    /**
     * - make sure utility actually exists --
     * - validate version number --
     * - validate utility name --
     * - check if remote repo exists
     *   - if so --
     *     - create the remote repo and --
     *     - push content --
     *   - if not --
     *     - pull remote utility branches --
     *     - get the latest branch number --
     *       - sort branches --
     *       - get latest --
     *
     *     - compare versions --
     *       - if current greater than remote push baby push --
     *       - if current equals the remote --
     *         - if hash's are equal prompt "up to date" --
     *         - if hash's are not equal prompt "did you update the version code? if not update the version code and try again." --
     *         - exit --
     *       - if current less than remote prompt that you are not up to date remote version is greater --
     *
     */

    const valid_name = isUtilityNameValid(input_utility_name);
    if (!valid_name) {
        logger.fatal("Provided Utility Name is not valid", input_utility_name);
    }

    logger.log("processing identifier");
    const {
        owner,
        repo,
        utility_current_owner_different_from_provided,
        utility_exists_on_project,
        utility_parent_dir_relative_path,
    } = await process_utility_identifier_input(input_utility_name);

    const utility_name = repo;

    logger.log("listing all utilities");
    const utils = context.utilities;

    logger.log("looking for utility");
    const util = utils.find(u => u.configFile.name == utility_name);

    if (!util) {
        logger.fatal('utility named "', utility_name, '" is not found');
        return;
    }

    logger.log("updating utility hash");
    const hash = await checkUtility(context, util.configFile.name);
    util.configFile.hash = hash.currentHash;

    if (util.configFile.private) {
        logger.warning(`this utility ${utility_name} is private it cannot be uploaded`);
        return;
    }

    logger.log("validating version");
    if (!parseUtilityVersion(util.configFile.version)) {
        logger.fatal(`${util.configFile.version} is not a valid version`);
        return;
    }

    logger.log("validating name");
    if (!isUtilityNameValid(util.configFile.name)) {
        logger.fatal(`"${util.configFile.name}" is not a valid name.`);
        return;
    }

    logger.log("getting token");
    const token = await get_token(owner);

    logger.log("collecting utility versions");
    let utility_versions = await get_utility_versions(owner, util.configFile.name);

    const last_version = utility_versions.at(-1);

    const push = async () => {
        logger.log("pushing...");
        try {
            // upload the file as a block to a new branch
            await upload_dir_octo(owner, util.configFile.name, token, util.configFile.version, util.path);
        } catch (error) {
            console.error(error);
            await deleteBranchOnFailure(owner, util.configFile.name, util.configFile.version);
        }
    };

    if (last_version) {
        const utilVersion = parseVersionOrExit(util.configFile.version);

        if (compareVersions(last_version, "<", utilVersion)) {
            await push();
        } else if (compareVersions(last_version, ">", utilVersion)) {
            logger.log(
                `utility ${utility_name} remote version (${last_version.version}) is greater than the local version ${util.configFile.version}`,
            );
        } else {
            const last_remote_config_file = (await get_file_from_repo(
                owner,
                util.configFile.name,
                "utils.json",
                last_version.version,
            )) as SingleGithubFile | null;
            if (!last_remote_config_file) {
                logger.error("Error loading utility config file from remote source for utility (file not found)", {
                    utility: last_version.version,
                    name: util.configFile.name,
                });
                await push();
            } else {
                const remote_util_config: typeof util.configFile = JSON.parse(
                    Buffer.from(last_remote_config_file.content, "base64").toString("utf-8"),
                );

                if (remote_util_config.hash != util.configFile.hash) {
                    logger.warning(
                        `utility: ${util.configFile.name} ,` +
                            "remote content last version equalt local, but the content is different are you sure you updated the version?",
                    );
                } else {
                    logger.success(`utility ${util.configFile.name} is up to date: ${util.configFile.version}`);
                }
            }
        }
    } else {
        await push();
    }

    if (main_dep) {
        projectContext.packageFile.verde.dependencies[repo] = {
            owner: owner,
            repo: repo,
            update_policy: projectContext.packageFile.verde.dependencies[repo]?.update_policy || "minor",
            version: util.configFile.version as any,
        };
    }
};

export const pushAllUtilities = async (context: ProjectContext) => {
    const chunked = chunkArr(context.utilities, CPU_COUNT * 2);

    const all_dependencies = await collect_dependencies_list(
        projectContext,
        projectContext.packageFile.verde.dependencies,
    );

    const excess_utilities = projectContext.utilities.filter(u => {
        return !all_dependencies[u.configFile.name];
    });

    for (const chunk of chunked) {
        await Promise.all(
            chunk.map(u =>
                push_utility({
                    context: projectContext,
                    input_utility_name: u.configFile.name,
                    main_dep:
                        !!projectContext.packageFile.verde.dependencies[u.configFile.name] ||
                        !!excess_utilities.find(u => u.configFile.name == u.configFile.name),
                }),
            ),
        );
    }
};
