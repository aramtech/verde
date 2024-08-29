import OS from "os";

export const CPU_COUNT = OS.cpus().length;

export const HOME_DIR_PATH = OS.homedir();
