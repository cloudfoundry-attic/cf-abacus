abacus-seqid
===

Sequential time-based ids, formed from the current time, app index, cluster worker id, and a counter.

## require('seqid')

The `seqid` function returns globally unique time-based identifiers. It assures that the identifiers are locally incrementing (i.e. within the same OS process, these ids will always be incrementing).

This is achieved by following the pattern:

```
<timestamp-padded-to-16-chars>-<app-index>-<instance-index>-<cluster-worker-index>-<counter>
```

The `app-index`, `instance-index`, and `cluster-worker-index` fields assure that the id is globally unique. 

Since there is a chance that the `timestamp` may be the same when calling the `seqid` function within the same millisecond on the same process, the `counter` variable is used to assure uniqueness, while maintaining order of the timestamp. Also, don't forget that clocks can skew backwards in case of NTP synchronizations and others. In such cases, the last timestamp generated is used and the `counter` is again incremented.

## require('seqid').sample

A function used to sample ids generated via the `seqid` function into buckets of certain size. The function handles multiple sample size syntaxes, but the operation that is performed is as follows.

```
floor(timestamp_of_id / bucket_size) * bucket_size
```

This basically, floors all ids into their nearest bucket timestamp, hence the returned timestamp can be treated as the bucked identifier.

For example, let's consider the following sequence ids.

* `0001475910365532-0-0-0-0`
* `0001475910365533-0-0-0-0`
* `0001475910365534-0-0-0-0`

These timestamps are an increment of `1` millisecond. Let's say we want a sampling of size 2 milliseconds. Then the ids from above would be sampled as follows.

* `0001475910365532-0-0-0-0 => floor(1475910365532 / 2) * 2 => 737955182766 * 2 => 1475910365532`
* `0001475910365533-0-0-0-0 => floor(1475910365533 / 2) * 2 => 737955182766 * 2 => 1475910365532`
* `0001475910365534-0-0-0-0 => floor(1475910365534 / 2) * 2 => 737955182767 * 2 => 1475910365534`

As you can see, the first two ids produced the same sample id, hence will end up in the same sample bucket, whereas the last id will have it's own bucket.
