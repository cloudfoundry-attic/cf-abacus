abacus-cf-smoke
===

`abacus` recurrent smoke test.

In order to run the test locally, you need the following environment variables set:

```bash
export OBJECT_STORAGE_CLIENT_ID=abacus-object-storage-client
export OBJECT_STORAGE_CLIENT_SECRET=abacus-object-storage-secret
export SYSTEM_CLIENT_ID=abacus-system-client
export SYSTEM_CLIENT_SECRET=abacus-secret
export SECURED=true

# optional, if set in accumulator environment
export TIME_WINDOWS_SIZES='{ "D" : 6 }'

# optional, if using non-default slack window
export SLACK=4D

# optional, if self-signed cert is in use
export SKIP_SSL_VALIDATION=true
```
