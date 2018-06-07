abacus-dbclient
===
Distributes DB operations over a set of DB partitions with MongoDB backend.

Dependencies
------------
The module is using `mongodb` [native NodeJS driver](https://github.com/mongodb/node-mongodb-native).

Implementation
--------------
All functions exposed by the API open a collection and then translate the API to Mongo driver primitives.

### get
Performs `find` with the specified `_id`. Returns the found document or `undefined` if not found (and not error!). The returned document has `_rev` set to 1 by default.


### put
Performs:
* `update` (with `{upsert: true}` option) if document with `_rev` is passed or
* `insertOne` with the provided document

Returns the input document with `id` equal to `_id` and `_rev` set to 1 by default. Translates 11000 error code into 409 status.

### remove
Calls `deleteOne` with the `_id` of the document. Returns the input document with `id` equal to `_id` and `_rev` with value from the stored document.

### allDocs
Has two flavours based on the options passed. If `startkey` and `endkey` are present in the options calls the range variant. Otherwise uses the list one.

* Range
    Uses `find` with: 
    * `{ $gte: opt.startkey, $lte: opt.endkey }`, or
    * `{ $gte: opt.endkey, $lte: opt.startkey }` if `descending: true`
 
* List
    Uses `find` with `{ $in: opt.keys }`.

Both variants filter out the `value` field if `include_docs: false`. They return the found documents with `id` equal to `_id` and `_rev` set to 1 by default.

### bulkDocs
Uses ordered bulk operation and:
* adds in the bulk with `upsert().updateOne` operations for each document that has `_rev`
* inserts with `insert` operation for document that has no specified `_rev`

Returns the input documents with `id` equal to `_id` and `_rev` set to 1 by default.

### batch_get
Performs `find` with `{ $in: [ <id1>, <id2>, ... , <idN> ]`.

Filters out the `value` field if `include_docs: false`. Returns the found documents with `id` equal to `_id` and `_rev` set to 1 by default.

### batch_put
Uses ordered bulk operation and:
* adds in the bulk with `upsert().updateOne` operations for each document that has `_rev`
* inserts with `insert` operation for document that has no specified `_rev`

Returns the input documents with `id` equal to `_id` and `_rev` set to 1 by default.

### batch_remove
Uses `deleteMany` with all docs batched. Returns the found documents with `id` equal to `_id` and `_rev` set to 1 by default.
