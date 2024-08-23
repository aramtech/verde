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
