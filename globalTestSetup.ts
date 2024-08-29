import fs from "fs-extra";
import path from "path";
import os from "os";

fs.mkdirpSync(path.join(os.tmpdir(), "verde", ".verde"));
