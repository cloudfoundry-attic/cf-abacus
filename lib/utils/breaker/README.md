breaker
===

Simple auto-reclosing circuit breaker for Node-style calls, inspired by the
Akka breaker.

Usage
---

This module provides a simple auto-reclosing circuit breaker (aka a recloser)
to help protect functions that sometimes fail and avoid failure cascades in
a graph of function calls. The breaker API was inspired by the Akka breaker
with a few refinements to make it simpler and more in line with the usual
Node function call patterns.

