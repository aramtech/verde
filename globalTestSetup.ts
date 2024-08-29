import fs from "fs-extra";
import path from "path";
import os from "os";

if (fs.existsSync(path.join(os.tmpdir(), "verde"))) {
    fs.removeSync(path.join(os.tmpdir(), "verde"));
}

fs.mkdirpSync(path.join(os.tmpdir(), "verde", ".verde"));
