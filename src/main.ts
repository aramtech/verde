import { program } from "commander";
import { addCommands } from "./cli";

addCommands(program);

program.parse();
