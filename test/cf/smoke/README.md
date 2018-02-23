abacus-cf-smoke
===

`abacus` recurrent smoke test.

In order to run the test locally, you need the following configuration:

```bash
export OBJECT_STORAGE_CLIENT_ID=<abacus-object-storage-client>
export OBJECT_STORAGE_CLIENT_SECRET=<abacus-object-storage-secret>
export SYSTEM_CLIENT_ID=<abacus-system-client>
export SYSTEM_CLIENT_SECRET=<abacus-secret>
export SECURED=<true/false>
export TIME_WINDOWS_SIZES=<TIME_WINDOWS_SIZES set in accumulator environment>
```