import { program } from "commander";
import { addInitCommand, addListToProgram, addRemoveUtilityCommand } from "./cli";

addListToProgram(program);
addInitCommand(program);
addRemoveUtilityCommand(program);

program.parse();
