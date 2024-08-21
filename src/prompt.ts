import enq from "enquirer";

export const read_answer_to = async (question: string) => {
    const { input }: { input: string } = await enq.prompt({
        type: "input",
        name: "input",
        message: question,
        required: true,
    });

    return input;
};

export const read_choice = async (question: string, choices: string[]) => {
    const { input }: { input: string } = await enq.prompt({
        type: "select",
        name: "input",
        choices,
        message: question,
    });

    return input;
};
