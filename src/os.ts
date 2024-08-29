import OS from "os";
import path from "path";

export const CPU_COUNT = OS.cpus().length;

export const HOME_DIR_PATH = process.env.NODE_ENV === "test" ? path.join(OS.tmpdir(), "verde") : OS.homedir();
