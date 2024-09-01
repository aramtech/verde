import {} from "./utility";

const strip_regex = (regex: RegExp) => {
    const stripped = String(regex).slice(1, -1).replace(/\$$/, "").replace(/^\^/, "");
    return stripped;
};

export const join_regex = (
    options: {
        ignore_case?: boolean;
        general?: boolean;
        join_exp: RegExp;
        include_end?: boolean;
        include_start?: boolean;
        group?: boolean;
    },
    ...regex_expressions: RegExp[]
) => {
    return RegExp(
        `${options.include_start ? "^" : ""}` +
            regex_expressions
                .map(r => `${options.group ? "(" : ""}` + strip_regex(r) + `${options.group ? ")" : ""}`)
                .join(strip_regex(options.join_exp)) +
            `${options.include_end ? "$" : ""}`,
        `${options.ignore_case ? "i" : ""}${options.general ? "g" : ""}`,
    );
};

export const utility_version_validation_regex = /^[0-9]+\.[0-9]+\.[0-9]+$/;
export const utility_name_validation_regex = /^[_\-a-zA-Z][_\-a-zA-Z0-9]{4,}$/;
export const org_name_validation_regex = /^[_\-a-zA-Z0-9]+$/;
export const owner_utility_match_regex = join_regex(
    {
        include_end: true,
        include_start: true,
        group: true,
        join_exp: /\//,
    },
    org_name_validation_regex,
    utility_name_validation_regex,
);
