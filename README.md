# verde

a CLI tool for vendoring utilities.

## Project goals

-   To make it easy to vendor and share code between projects without having to resort to a full fledged package management solutions.
-   To allow the user to control where the code is hosted and how it's fetched, synced and versioned.
-   To support hot patches and changes to the code on the fly.

## Installation

To install verde use npm and run the following command

```bash
$ npm i git@github.com:aramtech/verde.git --global
```

This will install verde from this github repository, you can then test it via:

```bash
$ verde list

no tool found!.
```

## Vendoring

To turn a directory with TypeScript/JavaScript modules into a vendored utility run:

```bash
$ verde init <utility-name> -d [description]
```

This will create a `utils.json` file, which is a simple config file that contains:

```json
{
    "name": "<utility-name>",
    "version": "0.1.0",
    "hash": "(a hash of the contents of all files of the utility)",
    "private": true,
    "description": ""
}
```

1. `name`: The name of the utility.
2. `deps`: The dependencies of the utility.
3. `version`: The utility's version.
4. `private`: Whether the utility is private to this project.

You can list the utilities in a given project by running:

```bash
$ verde list

* string-utils@1.5 | Utilities for manipulating with strings
* odoo-integration@0.1 | Utilities for integrating with odoo *private*
```

You can remove a utility from your project by running:

```bash
$ verde remove string-utils

string-utils@1.5 Was removed successfully
```

You can push a utility to github by running:

```bash
$ verde push string-utils

string-utils@1.5 Was pushed to github successfully
```

You can pull a utility from github by running:

```bash
$ verde pull string-utils

string-utils@1.5 was added to the project successfully
```

You can make a utility private by running:

```bash
$ verde hide string-utils
```

You can make it public again by running:

```bash
verde reveal string-utils
```
