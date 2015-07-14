yieldable
===

Small utility that converts Node callback based functions to generators that
are yieldable from co flow functions.

Usage
---

This module converts regular Node callback based functions to generators that
can be yielded from co flow functions. When given a module or an object it will
automatically convert all the functions it finds in it.

