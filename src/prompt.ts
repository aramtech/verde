import enq from "enquirer";

export const readAnswerTo = async (question: string, opts?: { type: "input" | "password" }) => {
    const type = opts?.type || "input";

    const { input }: { input: string } = await enq.prompt({
        type,
        name: "input",
        message: question,
        required: true,
    });

    return input;
};

export const readPrompt = async (question: string, choices: string[]) => {
    const { input }: { input: string } = await enq.prompt({
        type: "select",
        name: "input",
        choices,
        message: question,
    });

    return input;
};

export const requestPermsToRunWithCb = async (msg: string, cb: () => Promise<void> | void) => {
    const answer = await readPrompt(msg, ["yes", "no"]);

    if (answer === "yes") {
        await cb();
    }
};

export const requestPermsToRun = async (msg: string) => {
    const answer = await readPrompt(msg, ["yes", "no"]);

    if (answer === "yes") {
        return true
    }
    return false
};
