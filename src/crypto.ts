import crypto from "crypto";

export const hashBuffersWithSha256 = (buffers: Buffer[]): string =>
    buffers.reduce((acc, item) => acc.update(item), crypto.createHash("sha256")).digest("base64url");

const hashStringWithSha256 = (str: string) => crypto.createHash("sha256").update(str).digest("base64");

export const encryptBufferWithPassword = (buff: Buffer, password: string) => {
    const passwordHash = hashStringWithSha256(password);
    const passwordBytes = Buffer.from(passwordHash.slice(0, 32));

    const cipher = crypto.createCipheriv("aes256", passwordBytes, passwordBytes.subarray(0, 16));
    cipher.update(buff);
    return cipher.final();
};

export const decryptBufferWithPassword = (buff: Buffer, password: string) => {
    const passwordHash = hashStringWithSha256(password);
    const passwordBytes = Buffer.from(passwordHash.slice(0, 32));

    const decipher = crypto.createDecipheriv("aes256", passwordBytes, passwordBytes.subarray(0, 16));
    decipher.update(buff);

    return decipher.final();
};
