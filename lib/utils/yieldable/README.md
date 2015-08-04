abacus-yieldable
===

Convert async functions to generators yieldable from co flow functions.

This module converts async with callback functions to generators that can be
yielded from co flow functions. When given a module or an object it will
automatically convert all the exported functions it finds in it.

