import crypto from "crypto";
import Cryptr from "cryptr";

export const hashBuffersWithSha256 = (buffers: Buffer[]): string =>
    buffers.reduce((acc, item) => acc.update(item), crypto.createHash("sha256")).digest("base64url");

export const encryptBufferWithPassword = (buff: Buffer, password: string) => {
    const c = new Cryptr(password, { pbkdf2Iterations: 100 });
    return c.encrypt(buff.toString("utf-8"));
};

export const decryptBufferWithPassword = (buff: Buffer, password: string) => {
    const c = new Cryptr(password, { pbkdf2Iterations: 100 });
    return c.decrypt(buff.toString("utf-8"));
};
