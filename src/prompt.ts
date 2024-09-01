import enq from "enquirer";
import { loadingSpinner } from "./logger";
import { lock_method } from "./sync";

const spin_wrapper = async <T>(cp: (...args: any[]) => T): Promise<T> => {
    if (loadingSpinner.isSpinning) {
        loadingSpinner.stop();
        try {
            const res = await cp();
            loadingSpinner.start();
            return res;
        } catch (error) {
            loadingSpinner.start();
            throw error;
        }
    }
    return cp();
};
export const readAnswerTo = lock_method(
    async (question: string, opts?: { type: "input" | "password" }) => {
        return await spin_wrapper(async () => {
            const type = opts?.type || "input";
            const { input }: { input: string } = await enq.prompt({
                type,
                name: "input",
                message: question,
                required: true,
            });

            return input;
        });
    },
    { lock_name: "readAnswerTo" },
);

export const readPrompt = lock_method(
    async (question: string, choices: string[]) => {
        return spin_wrapper(async () => {
            const { input }: { input: string } = await enq.prompt({
                type: "select",
                name: "input",
                choices,
                message: question,
            });

            return input;
        });
    },
    {
        lock_name: "readPrompt",
    },
);

export const requestPermsToRunWithCb = lock_method(
    async (msg: string, cb: () => Promise<void> | void) => {
        return await spin_wrapper(async () => {
            const answer = await readPrompt(msg, ["yes", "no"]);

            if (answer === "yes") {
                await cb();
            }
        });
    },
    {
        lock_name: "requestPermsToRunWithCb",
    },
);

export const requestPermsToRun = lock_method(
    async (msg: string) => {
        return spin_wrapper(async () => {
            const answer = await readPrompt(msg, ["yes", "no"]);

            if (answer === "yes") {
                return true;
            }
            return false;
        });
    },
    { lock_name: "requestPermsToRun" },
);
