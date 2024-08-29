import { describe, test, beforeAll, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import { storeJSON } from "../src/fs";

describe("versions", () => {
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

    test("list-versions command: no matching utility found.", async () => {
        vi.spyOn(console, "error");

        const testDirPath = await moveToTestDir();

        await storeJSON("package.json", { name: "foo", version: "1.0.0" });

        try {
            const cmd = addCommands(new Command());
            await cmd.parseAsync(["node", "verde", "list-versions", "foo"]);
        } catch {}

        expect(console.error).toHaveBeenCalledWith("Utility not found");
    });
});
