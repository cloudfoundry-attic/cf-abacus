abacus-lrudown
===

LevelDown adapter for the lru-cache module.

Use in place of memdown as a LevelDown store for a PouchDB DB for example and
documents will be stored in a LRU cache (and evicted from the cache later).

This is useful if you want to use the same PouchDB API for your local
in-memory cache and your persistent CouchDB DB.

