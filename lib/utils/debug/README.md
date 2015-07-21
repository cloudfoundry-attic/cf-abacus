debug
===

Tiny debug log utility, based off the popular Node [debug](https://github.com/visionmedia/debug)
module.

Usage
---

This module can be used pretty much like the original Node debug module. On top
of that it provides a %o format specifier for a prettier formatting of objects,
truncation of big object dumps to avoid overflowing the output, and the ability
to enable/disable debug logging dynamically.

