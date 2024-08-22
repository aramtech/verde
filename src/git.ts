import path from "path";
import { isCommandOnSystem, runCommand } from "./os.ts";

export const is_git_installed_on_system = () => isCommandOnSystem("git");

const repo_name_to_cli_link = (repo_name: string) => `https://github.com/${repo_name}`;

export const is_repo_reachable_by_cli = (repository_name: string) => {
    try {
        runCommand(`git ls-remote ${repo_name_to_cli_link(repository_name)}`);
        return true;
    } catch (_) {
        return false;
    }
};

export const get_files_with_git_cli = async (repo_name: string, branch: string, new_project_path: string) => {
    const full_new_project_path = path.resolve(new_project_path);

    runCommand(`git clone --depth=1 -b ${branch} ${repo_name_to_cli_link(repo_name)} ${new_project_path}`, {
        stdio: "inherit",
        encoding: "utf-8",
    });
    runCommand(`rm -rf ${full_new_project_path}/.git `);
    return;
};
