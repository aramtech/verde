import { Octokit } from "@octokit/rest";
import logger from "./logger";
import { get_token } from "./tokens";

const octokitClients: {
    [owner: string]: Octokit; 
} = {};
export const get_octokit_client = async (owner: string) => {
    if (octokitClients[owner]) {
        return octokitClients[owner];
    }
    const token = await get_token(owner);

    const client = new Octokit({
        auth: token,
        log: {
            info(message) {
                logger.log(message);
            },
            error(message) {
                if (message.match(/\b404\b/)) {
                    return;
                }
                logger.error(message);
            },
            debug(message) {
                // console.debug(message);
            },
            warn(message) {
                logger.warning(message);
            },
        },
    });
    octokitClients[owner] = client;
    return client;
};
