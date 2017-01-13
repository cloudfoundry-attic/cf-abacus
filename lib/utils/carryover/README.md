abacus-carryover
===
Functionality used by `cf-bridge` and `cf-renewer` to build state DB for the `linux-container` time-based metrics. 
 
The module writes the id of the last "started" usage doc sent to the `collector` per application. It also supports paged read of the collector ids.    

