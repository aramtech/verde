import OS from "os";
import { execSync, type ExecSyncOptionsWithStringEncoding } from "child_process";

export const CPU_COUNT = OS.cpus().length;

export const runCommand = (command: string, opts?: ExecSyncOptionsWithStringEncoding | undefined) => {
    console.log("about to run command", command);
    return execSync(
        command,
        opts || {
            encoding: "utf-8",
        },
    );
};

export const isCommandOnSystem = (command: string) => {
    try {
        runCommand(`${command} --version`);
        return true;
    } catch (_) {
        return false;
    }
};
