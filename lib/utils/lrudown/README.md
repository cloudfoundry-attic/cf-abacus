lrudown
===

A Leveldown adapter for the popular Node LRU module.

Usage
---

Use in place of memdown as a leveldown store for a PouchDB db. Documents will
be stored in an Node LRU cache (and evicted from the cache later). This is
useful in particular if you want to use the same CouchDB API for your local
in-memory cache and your persistent CouchDB db.

