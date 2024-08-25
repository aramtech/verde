import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { storeObjectInCwd } from "../src/fs";

describe("list", () => {
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

    test("list command: no packages at the current directory.", async () => {
        vi.spyOn(console, "warn");

        await moveToTestDir();
        await storeObjectInCwd("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "list"]);

        expect(console.warn).toHaveBeenCalledWith("no tool found!.");
    });

    test("list command: should list all the tools in the path correctly.", async () => {
        vi.spyOn(console, "log");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", {
            name: "foo-package",
            version: "1.0.0",
        });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        await fs.mkdir(path.join(testDirPath, "bar-util"));
        await fs.writeFile(
            path.join(testDirPath, "bar-util", "utils.json"),
            JSON.stringify({ name: "bar", deps: {}, version: "10.0.0", hash: "bar" }),
        );

        await fs.mkdir(path.join(testDirPath, "baz-util"));
        await fs.writeFile(
            path.join(testDirPath, "baz-util", "utils.json"),
            JSON.stringify({ name: "baz", deps: {}, version: "10.0.0", hash: "baz" }),
        );

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "list"]);

        expect(console.log).toHaveBeenCalledWith("Tool found: ", "foo");
        expect(console.log).toHaveBeenCalledWith("Tool found: ", "bar");
        expect(console.log).toHaveBeenCalledWith("Tool found: ", "baz");
    });
});
