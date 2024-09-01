import ora from "ora";

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

export const loadingSpinner = ora();
loadingSpinner.start()
const color_text = (
    color: "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "console_color",
    ...text: any[]
): string => {
    return `${colors[color]}${text.join(" ")}${colors.console_color}`;
};

const spin_wrapper = <T>(cp: (...args: any[]) => T): T => {
    if (loadingSpinner.isSpinning) {
        loadingSpinner.stop();
        const res = cp();
        loadingSpinner.start();
        return res;
    }
    return cp();
};

export const error = (...message: any[]) => {
    spin_wrapper(() => {
        console.error(color_text("red", ...message));
    });
};

export const success = (...message: any[]) => {
    spin_wrapper(() => {
        console.log(color_text("green", ...message));
    });
};

export const info = (...message: any[]) => {
    spin_wrapper(() => {
        console.log(color_text("blue", ...message));
    });
};

export const warning = (...message: any[]) => {
    spin_wrapper(() => {
        console.warn(color_text("yellow", ...message));
    });
};

export const fatal = (...message: any[]): never => {
    return spin_wrapper<never>(() => {
        console.error(...message);
        process.exit(1);
    });
};
export const log = (...message: any[]) => {
    if (loadingSpinner.isSpinning) {   
        // loadingSpinner.stop()
        loadingSpinner.text = message.join(" ");        
        // loadingSpinner.start()
        return;
    }
    console.log(...message);
};
export default { info, error, success, warning, fatal, log };
