import { existsSync } from "fs";
import fs from "fs/promises";

fs.exists = existsSync as any;
