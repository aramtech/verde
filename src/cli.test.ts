import { describe, test, beforeAll, vi, expect } from "vitest";
import { addInitCommand } from "./cli";
import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";

describe("cli.ts", () => {
    beforeAll(async () => {
        fs.exists = existsSync as any;
    });

    test("should initialize a package at the cwd.", async () => {
        vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

        const cmd = new Command();
        addInitCommand(cmd);

        await cmd.parseAsync(["node", "verde", "init", "foo"]);

        expect(fs.writeFile).toHaveBeenCalledTimes(1);
    });

    test("package already exists in the current dir.", async () => {
        vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
        vi.spyOn(fs, "exists").mockImplementation(async () => true);
        vi.spyOn(console, "error");

        const cmd = new Command();
        addInitCommand(cmd);

        await cmd.parseAsync(["node", "verde", "init", "foo"]);

        expect(fs.writeFile).not.toHaveBeenCalledWith(
            "utils.json",
            JSON.stringify({ name: "foo", deps: {}, hash: "foo", version: "0.0.1" }),
        );

        expect(console.error).toHaveBeenCalledWith("directory already managed by verde!.");
    });
});
