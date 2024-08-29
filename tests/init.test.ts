import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { readJSON, storeJSON } from "../src/fs";
import { type UtilityFile } from "../src/utility";

describe("init", () => {
    let originalCwd: string = process.cwd();

    beforeAll(async () => {
        fs.exists = existsSync as any;
    });

    beforeEach(() => {
        vi.spyOn(process, "exit").mockImplementation(() => {
            throw new Error("Exit called");
        });
    });

    afterEach(() => process.chdir(originalCwd));

    const moveToTestDir = async () => {
        const name = `/tmp/${randomInt(500_000)}`;

        await fs.mkdir(name);
        process.chdir(name);

        return name;
    };

    test("init command: should initialize a package at the cwd.", async () => {
        await moveToTestDir();

        await storeJSON("package.json", {
            name: "foo",
            version: "0.1.0",
        });

        const cmd = new Command();
        addCommands(cmd);

        await cmd.parseAsync(["node", "verde", "init", "foo", "-d FOO IS GREAT BAR IS NONE"]);

        const utilFile = await readJSON<UtilityFile>("utils.json");

        expect(utilFile.name).toBe("foo");
        expect(utilFile.description).toBe("FOO IS GREAT BAR IS NONE");
    });

    test("init command: package already exists in the current dir.", async () => {
        await moveToTestDir();

        await storeJSON("package.json", {
            name: "foo",
            version: "0.1.0",
        });

        vi.spyOn(console, "error");

        const cmd = new Command();
        addCommands(cmd);

        await cmd.parseAsync(["node", "verde", "init", "foo"]);
        await cmd.parseAsync(["node", "verde", "init", "foo"]);

        expect(console.error).toHaveBeenCalledWith("directory already managed by verde!.");
    });
});
