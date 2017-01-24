# eslint-plugin-nodate

[ESLint](http://eslint.org) plugin that disallows usage of new Date()

## Installation

Refer `eslint-plugin-nodate` in the package.json (devDependencies). 

To use it in Abacus:

```
"eslint-plugin-nodate": "file:tools/eslint-plugin-nodate"
```

## Usage

Add `nodate` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "nodate"
    ]
}
```

or in `yaml` format:

```yml
---
plugins:
  - nodate
```

Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "nodate/nodate": 2
    }
}
```

or in `yaml`:

```yml
rules:
 nodate/nodate: 1
```
