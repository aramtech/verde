import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { randomInt } from "crypto";
import path from "path";
import { storeJSON } from "../src/fs";
import { cache } from "../src/cache";
import fs from "fs-extra";
import { HOME_DIR_PATH } from "../src/os";

describe("cache", () => {
    let originalCwd: string = process.cwd();

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

    test("cache command: no cache entries.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "cache"]);
    });

    test("cache command: should list entry that was added right before calling the command.", async () => {
        vi.spyOn(console, "log");

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        await cache("foo.js", Buffer.from("Hello world"));

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "cache", "list"]);

        expect(console.log).toHaveBeenCalledWith(`Found entry with name: foo.js`);
    });

    test("cache command: clear subcommand should clear the cache.", async () => {
        vi.spyOn(fs, "remove").mockResolvedValue(undefined);

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        await cache("baz.js", Buffer.from("// baz!"));

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "cache", "clear"]);

        expect(fs.remove).toHaveBeenCalledWith(path.join(HOME_DIR_PATH, ".verde", "cache-baz.js"));
    });
});
