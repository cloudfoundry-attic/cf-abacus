abacus-cf-renewer
===

Providers of resources metered using time-based usage metrics need to send at least one usage "ping" doc per month, to get the consumption from the previous month accumulated and carried over each month, while these resources are still active.

This allows inactive resources to not be carried over into each new monthly database partition and get naturally phased out (sort of garbage collected). Without that, Abacus would have to keep around usage for these inactive resources forever, causing its monthly databases to grow indefinitely.

The required "ping" usage submission can happen anytime during the month.

The memory consumption metric used in the `linux-container` sample resource is time-based and it is used by `cf-bridge`. Therefore users of cf-bridge need to send such "ping" requests to Abacus.

The `cf-renewer` app transfers the active resource consumption from the previous month into the current one by effectively sending the required "ping" doc.

To do this the following steps are executed:
* `cf-bridge` stores a reference to start or scale usage in a special carry-over DB
* `cf-bridge` deletes the reference on application stop
* `cf-renewer` lists the collected usage from the previous month
* `cf-renewer` re-submits the active usage for the current month