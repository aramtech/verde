import { createHash } from "crypto";

export const hashBuffersWithSha256 = (buffers: Buffer[]): string =>
    buffers.reduce((acc, item) => acc.update(item), createHash("sha256")).digest("base64url");
