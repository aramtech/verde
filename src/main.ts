#!/usr/bin/env bun

import { program } from "commander";
import { addCommands } from "./commands";

addCommands(program);

program.parse();
