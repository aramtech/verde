import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import path from "path";
import { readJSON, storeJSON } from "../src/fs";
import { type UtilityFile } from "../src/utility";
import type { ProjectContext } from "../src/project";

describe("config", () => {
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

    test("config command: no verde entry should write default.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeJSON("package.json", { name: "FOO" });
        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "config"]);

        const packageFile = await readJSON<ProjectContext["packageFile"]>("package.json");

        expect(packageFile.name).toBe("FOO");
        expect(packageFile.verde.org).toBe("aramtech");
        expect(packageFile.verde.dest).toBe("./server/utils");
        expect(packageFile.verde.deps).toEqual({});
    });

    test("config command: should not update an existing config entry.", async () => {
        vi.spyOn(console, "error");

        await moveToTestDir();

        await storeJSON("package.json", {
            name: "FOO",
            verde: { org: "salem-is-the-best", dest: "he-does-not-write-tests-though ; - ;" },
        });
        const cmd = addCommands(new Command());
        await cmd.parseAsync(["node", "verde", "config"]);

        const packageFile = await readJSON<ProjectContext["packageFile"]>("package.json");

        expect(packageFile.name).toBe("FOO");
        expect(packageFile.verde.org).toBe("salem-is-the-best");
        expect(packageFile.verde.dest).toBe("he-does-not-write-tests-though ; - ;");
    });
});
