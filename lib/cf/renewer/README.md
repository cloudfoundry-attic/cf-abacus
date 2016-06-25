abacus-cf-renewer
===

Providers of resources metered using time-based usage metrics need to send at least one usage "ping" doc per month, to get the consumption from the previous month accumulated and carried over each month, while these resources are still active.

This allows inactive resources to not be carried over into each new monthly database partition and get naturally phased out (sort of garbage collected). Without that, Abacus would have to keep around usage for these inactive resources forever, causing its monthly databases to grow indefinitely.

The required "ping" usage submission can happen anytime during the month.

The memory consumption metric used in the `linux-container` sample resource is time-based and it is used by `cf-bridge`. Therefore users of cf-bridge need to send such "ping" requests to Abacus.

The `cf-renewer` app transfers the active resource consumption from the previous month into the current one by effectively sending the required "ping" doc.

To do this the `cf-renewer` executes the following steps:
* list the collected usage from the previous month
* pick the last usage doc
* check if the doc is not "stop" usage (`current_instance_memory: 0`)
* skip/filter out the "stopped" usage
* re-submit the active usage for the current month

:warning: **Warning:** :warning:   
The `cf-renewer` app supports only plans with "pure" time-based metrics. This means that any usage docs with metering plan that has both discrete and time-based metrics will be ignored !