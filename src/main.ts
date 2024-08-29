#!/usr/bin/env bun

import { program } from "commander";
import { addCommands } from "./commands";
import { maybeCreateVerdeDirAtHomeDir } from "./storage";

const parseAndRun = async () => {
    maybeCreateVerdeDirAtHomeDir();

    addCommands(program);
    await program.parseAsync();
};

parseAndRun();
