import { describe, test, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import { storeJSON } from "../src/fs";

describe("pull", () => {
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

    test("version is invalid, should render an error.", async () => {
        vi.spyOn(console, "error");
        vi.spyOn(process, "exit");

        await moveToTestDir();

        await storeJSON("package.json", { name: "foo", version: "1.0.0" });

        try {
            const cmd = addCommands(new Command());
            await cmd.parseAsync(["node", "verde", "pull", "common", "--version=foo.bar.baz"]);
        } catch {}

        expect(process.exit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith("foo.bar.baz is not a valid version");
    });
});
