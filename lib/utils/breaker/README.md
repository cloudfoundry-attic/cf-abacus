abacus-breaker
===

Auto-reclosing circuit breaker for async function calls, inspired by the Akka
breaker.

This module provides a simple auto-reclosing circuit breaker (aka a recloser)
to help protect functions that sometimes fail and avoid failure cascades in
a graph of function calls. The breaker API is inspired by the Akka breaker
with a few refinements to make it a bit simpler and more in line with the
usual Node async function call pattern.

