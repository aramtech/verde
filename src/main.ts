import { program } from "commander";
import { addListToProgram } from "./cli";

addListToProgram(program);

program.parse();
