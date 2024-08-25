import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { storeJSON } from "../src/fs";

describe("remove", () => {
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

    test("remove command: no matching utility found should do nothing.", async () => {
        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

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

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "remove", "baz"]);

        expect(await fs.exists(path.join(testDirPath, "foo-util"))).toBe(true);
        expect(await fs.exists(path.join(testDirPath, "bar-util"))).toBe(true);
    });

    test("remove command: found matching utility, should remove it.", async () => {
        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });

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
            JSON.stringify({ name: "baz", deps: {}, version: "10.0.0", hash: "bar" }),
        );

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "remove", "baz"]);

        expect(await fs.exists(path.join(testDirPath, "foo-util"))).toBe(true);
        expect(await fs.exists(path.join(testDirPath, "bar-util"))).toBe(true);
        expect(await fs.exists(path.join(testDirPath, "baz-util"))).toBe(false);
    });
});
