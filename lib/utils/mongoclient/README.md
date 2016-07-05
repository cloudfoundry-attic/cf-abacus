abacus-mongoclient
===

Distributes DB operations over a set of DB partitions with MongoDB backend.


Dependencies
------------

The module is using `mongodb` [native NodeJS driver](https://github.com/mongodb/node-mongodb-native).


Differences between Couch and Mongo
-----------------------------------

### Revisions
Couch supports revisions of documents using the `_rev` field. Updates are done specifying the previous revision in the document. If `_rev` is not specified then a new documents is created. That's why Abacus modules should store the `_rev` field in memory, to do an update.

Mongo does not have this concept natively and `mongoclient` have to simulate it by simply storing the `_rev` field and switching between `insert` and `update` operation modes.

### User provided vs stored fields

Documents in Couch have both `_id`, `id`, `_rev` and `rev` fields. The underscored ones are provided by the user, while the non-prefixed ones are the ones stored by CouchDB. 

The API function callbacks with CouchDB client module will return the non-prefixed `id` and `rev` fields since they return the stored object metadata.

To keep the same behaviour the MongoDB client returns the `id` and `rev` fields.


### Duplicated documents

The multi-document functions such as `allDocs` and `bulkDocs` return the result in the same order as the input array of document ids.

If the list of ids contains duplicated entries:
```
id1
id2
id3
id1
```

then the result with CouchDB is:
```
value1
value2
value3
value1
```

Mongo on the other hand does not return duplicating results due to the semantics of the used `find`. The client mimics the Couch client and builds in-memory the same result set, although the DB call returns just the first 3 values.


### Document order

CouchDB returns the documents in the order the request ids are presented. Mongo maintains natural order by default, which means that the client has to reorder the results in the expected by the client form.
 
This is done in the same code as the deduping logic described above in the `batchOp` and `bulkOp` functions.


### Range operations

CouchDB requires the start and end keys to be swapped in `allDocs` if the user selected descending order of the result.

Mongo client maintains the same requirement and internally swaps the keys before passing them to the underlying Mongo driver.


### Operation metadata

The Couch database returns the status of the operation and the stored `id` and `rev` fields. Mongo returns a different result set for the different operations.

To comply with the `couchclient` API this module returns the same metadata, returning the input docs in case of successful operation completion. This is done to avoid additional round-trip to the database.  


### Error codes

CouchDB communicates over HTTP/HTTPS. This makes it easy to include HTTP response codes, such as 409 or 404 in its driver/client errors.

These codes are propagated to `abacus-retry` and `abacus-breaker` modules by setting `noretry` and `nobreaker` flags in the error.

This client adds the same flags, based on different criteria - error code 11000 for instance.


### Collections

This module adds support for the collections in MongoDB. If the URI is in the form ```mongodb://user:password@host:port/database/collection```, then the documents will be saved under the specified collection.

If no collection is specified, then the default collection `documents` will be used.


### Partitioning

The partitioning in the Mongo client is based on the whole URI since it can contain database and collection, while in Couch client the partitioning is based on database name only.
 
The partition names are constructed by using the last component in the URI (database or collection) and appending partition suffix.
  
This enables the use of managed databases, that usually provide service instances with URI including collection. 


### URI

This client appends all options specified by the user to the partitions created during its normal functioning. An example is the Mongo schema, specified as option `?ssl=true` after the address.


### Connection options

Couch client passes `skip_setup: true` option to avoid creating a database on read access. In Mongo this is the default behaviour and we don't need any additional flags.

The Mongo client uses a pool of 1 connection since every DB is pooled internally. It also uses socket keep alive and connection timeout of 30000 ms by default.


 
Implementation
--------------

The `mongoclient` module implements the same API as `couchclient`. In this way it can serve as drop-in replacement and requires extremely thin abstraction layer, implemented in `dbclient`.

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
