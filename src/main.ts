#!/usr/bin/env bun

import { program } from "commander";
import { addCommands } from "./commands";
import { loadingSpinner } from "./logger";
import { maybeCreateVerdeDirAtHomeDir } from "./storage";

const parseAndRun = async () => {
    maybeCreateVerdeDirAtHomeDir();

    addCommands(program);
    await program.parseAsync();
    loadingSpinner.stop();
    console.log("\n\n");
};

await parseAndRun();
process.exit();
