import enq from "enquirer";

export const readAnswer = async (question: string) => {
    const { input }: { input: string } = await enq.prompt({
        type: "input",
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

export const requestPermsToRun = async (msg: string, cb: () => Promise<void> | void) => {
    const answer = await readPrompt(msg, ["yes", "no"]);

    if (answer === "yes") {
        await cb();
    }
};
