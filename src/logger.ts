import process from "process";

const colors = {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    console_color: "\x1b[0m",
};

const color_text = (
    color: "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "console_color",
    ...text: any[]
): string => {
    if (process.env.NODE_ENV === "test") {
        return text.join(" ");
    }

    return `${colors[color]}${text.join(" ")}${colors.console_color}`;
};

export const error = (...message: any[]) => {
    console.error(color_text("red", ...message));
};

export const success = (...message: any[]) => {
    console.log(color_text("green", ...message));
};

export const warning = (...message: any[]) => {
    console.warn(color_text("yellow", ...message));
};

export const fatal = (...message: any[]) => {
    console.log(...message);
    process.exit(1);
};
export const log = (...message: any[]) => {
    console.log(...message);
};
export default { error, success, warning, fatal, log };
