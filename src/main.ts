import { program } from "commander";
import { addInitCommand, addListToProgram } from "./cli";

addListToProgram(program);
addInitCommand(program);

program.parse();
