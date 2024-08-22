import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "./commands";
import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { readJSON, storeObjectInCwd } from "./fs";
import { type UtilityFile } from "./utility";

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

    test("init command: should initialize a package at the cwd.", async () => {
        await moveToTestDir();

        const cmd = new Command();
        addCommands(cmd);

        await cmd.parseAsync(["node", "verde", "init", "foo", "-d FOO IS GREAT BAR IS NONE"]);

        const utilFile = await readJSON<UtilityFile>("utils.json");

        expect(utilFile.name).toBe("foo");
        expect(utilFile.description).toBe("FOO IS GREAT BAR IS NONE");
    });

    test("init command: package already exists in the current dir.", async () => {
        await moveToTestDir();

        vi.spyOn(console, "error");

        const cmd = new Command();
        addCommands(cmd);

        await cmd.parseAsync(["node", "verde", "init", "foo"]);
        await cmd.parseAsync(["node", "verde", "init", "foo"]);

        expect(console.error).toHaveBeenCalledWith("directory already managed by verde!.");
    });

    test("list command: no packages at the current directory.", async () => {
        vi.spyOn(console, "warn");

        await moveToTestDir();

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

    test("remove command: no matching utility found should do nothing.", async () => {
        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

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

        await storeObjectInCwd("package.json", { name: "FOO" });

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

    test("reveal command: no matching utility found.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "reveal", "baz"]);

        expect(console.error).toHaveBeenCalledWith("could not find utility with name baz");
    });

    test("reveal command: should update the config file of the utility.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        await fs.mkdir(path.join(testDirPath, "foo-util"));
        await fs.writeFile(
            path.join(testDirPath, "foo-util", "utils.json"),
            JSON.stringify({ name: "foo", deps: {}, version: "10.0.0", hash: "foo" }),
        );

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "reveal", "foo"]);

        expect(console.error).not.toHaveBeenCalledWith("could not find utility with name foo");

        const utilFile = await readJSON<UtilityFile>("./foo-util/utils.json");

        expect(utilFile.private).toBe(false);
    });

    test("check command: should log an error if the utility cannot be found.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        try {
            const cmd = addCommands(new Command());
            await cmd.parseAsync(["node", "verde", "check", "foo"]);
        } catch {}

        expect(console.error).toHaveBeenCalledWith("could not find utility with name foo");
    });

    test("check command: checksum matches.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());
        await fs.mkdir(path.join(testDirPath, "foo"));
        await fs.writeFile(path.join(testDirPath, "foo", "index.ts"), "console.log('hello world')");
        process.chdir("./foo");
        await cmd.parseAsync(["node", "verde", "init", "foo"]);
        process.chdir("..");

        const utilFileBeforeCheck = await readJSON<UtilityFile>("./foo/utils.json");

        await cmd.parseAsync(["node", "verde", "check", "foo"]);

        const utilFileAfterCheck = await readJSON<UtilityFile>("./foo/utils.json");

        expect(utilFileBeforeCheck.hash).toBe(utilFileAfterCheck.hash);
    });

    test("check command: checksum mismatch.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());
        await fs.mkdir(path.join(testDirPath, "foo"));
        await fs.writeFile(path.join(testDirPath, "foo", "index.ts"), "console.log('hello world')");
        process.chdir("./foo");
        await cmd.parseAsync(["node", "verde", "init", "foo"]);
        await fs.writeFile(path.join(testDirPath, "foo", "index2.ts"), "console.log('this file changes the hash')");
        process.chdir("..");

        const utilFileBeforeCheck = await readJSON<UtilityFile>("./foo/utils.json");

        await cmd.parseAsync(["node", "verde", "check", "foo"]);

        const utilFileAfterCheck = await readJSON<UtilityFile>("./foo/utils.json");

        expect(utilFileBeforeCheck.hash).not.toBe(utilFileAfterCheck.hash);
    });

    test("check all command: no utilities found in project.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "check"]);

        expect(console.error).not.toHaveBeenCalled();
    });

    test("check all command: all checksums match.", async () => {
        vi.spyOn(console, "log");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());

        let i = 50;

        while (i > 0) {
            const name = `foo-${i}`;

            await fs.mkdir(path.join(testDirPath, name));
            await fs.writeFile(path.join(testDirPath, name, "index.ts"), "console.log('hello world')");
            process.chdir(`./${name}`);
            await cmd.parseAsync(["node", "verde", "init", name]);

            i--;
            process.chdir("..");
        }

        await cmd.parseAsync(["node", "verde", "check"]);

        i = 50;

        while (i > 0) {
            const name = `foo-${i}`;
            expect(console.log).toHaveBeenCalledWith(`utility "${name}" hash match!.`);
            i--;
        }
    });

    test("check all command: half checksums do not match.", async () => {
        vi.spyOn(console, "log");

        const testDirPath = await moveToTestDir();

        await storeObjectInCwd("package.json", { name: "FOO" });

        const cmd = addCommands(new Command());

        let i = 50;

        while (i > 0) {
            const name = `foo-${i}`;

            await fs.mkdir(path.join(testDirPath, name));
            await fs.writeFile(path.join(testDirPath, name, "index.ts"), "console.log('hello world')");
            process.chdir(`./${name}`);
            await cmd.parseAsync(["node", "verde", "init", name]);

            i--;
            process.chdir("..");
        }

        i = 25;

        while (i > 0) {
            const name = `foo-${i}`;
            process.chdir(`./${name}`);

            await fs.writeFile(path.join(testDirPath, name, "index2.ts"), "console.log('should change stuff')");

            i--;
            process.chdir("..");
        }

        await cmd.parseAsync(["node", "verde", "check"]);

        i = 25;

        while (i > 0) {
            const name = `foo-${i}`;
            expect(console.log).toHaveBeenCalledWith(`${name} hash mismatch, updating on disk config file...`);

            i--;
            process.chdir("..");
        }
    });
});
