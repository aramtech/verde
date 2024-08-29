import fs from "fs-extra";
import path from "path";
import os from "os";

if (!fs.existsSync(path.join(os.homedir(), ".verde"))) {
    await fs.mkdirSync(path.join(os.homedir(), ".verde"));
}
