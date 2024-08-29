import { describe, test, beforeEach, afterEach, vi, expect } from "vitest";
import { addCommands } from "../src/commands";
import { Command } from "commander";
import fs from "node:fs/promises";
import { randomInt } from "crypto";
import { storeJSON } from "../src/fs";

import * as Prompt from "../src/prompt";
import { encryptAndSaveFileToStorage } from "../src/storage/encrypted";

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

    test("prompt the user for the tokens if no tokens exist and print an error and exit if the maximum try count exceeds.", async () => {
        vi.spyOn(console, "error");
        vi.spyOn(process, "exit");

        vi.spyOn(Prompt, "readAnswerTo")
            .mockResolvedValue("aramtech-is-cool")
            .mockResolvedValue("github-token-is-cool");

        await moveToTestDir();

        await storeJSON("package.json", { name: "foo", version: "1.0.0" });

        try {
            const cmd = addCommands(new Command());
            await cmd.parseAsync(["node", "verde", "pull", "common2"]);
        } catch {}

        expect(Prompt.readAnswerTo).toHaveBeenCalledWith("Please input your organization name:");
        expect(Prompt.readAnswerTo).toHaveBeenCalledWith(
            "Please provide your classic personal github access token (you can create one at https://github.com/settings/tokens)\n\n Token:",
        );
        expect(console.error).toHaveBeenCalledWith("Maximum try count exceeded");
    });
});
