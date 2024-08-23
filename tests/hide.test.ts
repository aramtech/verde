import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { readJSON, storeObjectInCwd } from "../src/fs";
import { type UtilityFile } from "../src/utility";

describe("CLI", () => {
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

    test("hide command: no matching utility found.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "hide", "baz"]);

        expect(console.error).toHaveBeenCalledWith("could not find utility with name baz");
    });

    test("hide command: should update the config file of the utility.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "hide", "foo"]);

        expect(console.error).not.toHaveBeenCalledWith("could not find utility with name foo");

        const utilFile = await readJSON<UtilityFile>("./foo-util/utils.json");

        expect(utilFile.private).toBe(true);
    });
});
