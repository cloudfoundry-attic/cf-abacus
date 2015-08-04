abacus-batch
===

Batching for async function calls.

This module provides a simple way to implement function call batching. Batching
is achieved by wrapping a function in logic that records calls in a batch for
some time then calls that function once with the accumulated batch, giving it an
opportunity to process all the calls efficiently at once. Unbatching takes a
batch of calls, applies then individually to a function, then returns a batch of
results.

