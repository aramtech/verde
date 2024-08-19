import type { Command } from "commander";
import { collectDirsWithFile } from "./fs";

export const addListToProgram = (program: Command) => program.command("list <path>").action(async path => {
  const utilDirs = await collectDirsWithFile(path, {
    exclude: ["node_modules", ".git"],
    configFilename: "utils.json",
  });

  console.log(utilDirs);
});
