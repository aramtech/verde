import { execSync, type ExecSyncOptionsWithStringEncoding } from "child_process";
import logger from "./logger";

const run_command = (command: string, opts?: ExecSyncOptionsWithStringEncoding | undefined) => {
    logger.log("about to run command", command);
    return execSync(
        command,
        opts || {
            encoding: "utf-8",
        },
    );
};

const command_on_system = (command: string) => {
    try {
        run_command(`${command} --version`);
        return true;
    } catch (_) {
        return false;
    }
};

export { command_on_system, run_command };
