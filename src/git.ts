import path from "path";
import { command_on_system, run_command } from "./exec.js";

export const is_git_installed_on_system = () => command_on_system("git");

const repo_name_to_cli_link = (repo_name: string) => `https://github.com/${repo_name}`;

export const is_repo_reachable_by_cli = (repository_name: string) => {
    try {
        run_command(`git ls-remote ${repo_name_to_cli_link(repository_name)}`);
        return true;
    } catch (_) {
        return false;
    }
};

export const get_files_with_git_cli = async (repo_name: string, branch: string, new_project_path: string) => {
    const full_new_project_path = path.resolve(new_project_path);

    run_command(`git clone --depth=1 -b ${branch} ${repo_name_to_cli_link(repo_name)} ${new_project_path}`, {
        stdio: "inherit",
        encoding: "utf-8",
    });
    run_command(`rm -rf ${full_new_project_path}/.git `);
    return;
};
