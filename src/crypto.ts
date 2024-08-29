import crypto from "crypto";
import Cryptr from "cryptr";

export const hashBuffersWithSha256 = (buffers: string[]): string =>
    buffers.reduce((acc, item) => acc.update(item, "utf-8"), crypto.createHash("sha256")).digest("base64url");

export const encryptStringWithPassword = (text: string, password: string) => {
    const c = new Cryptr(password, { pbkdf2Iterations: 100 });
    return c.encrypt(text);
};

export const decryptStringWithPassword = (encryptedText: string, password: string) => {
    const c = new Cryptr(password, { pbkdf2Iterations: 100 });
    return c.decrypt(encryptedText);
};
