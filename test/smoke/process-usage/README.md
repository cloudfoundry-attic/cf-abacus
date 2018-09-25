abacus-process-usage-smoke-test
===

To run the process usage smoke test export the following environment variables:

```bash
export OBJECT_STORAGE_CLIENT_ID=<prefix>
abacus-object-storage-client
export OBJECT_STORAGE_CLIENT_SECRET=abacus-object-storage-secret
export SYSTEM_CLIENT_ID=<prefix>abacus-system-client
export SYSTEM_CLIENT_SECRET=abacus-secret
export SECURED=true
# optional
export TIME_WINDOWS_SIZES='{ "D" : 6 }' # if set in accumulator environment
export SLACK=4D # if using non-default slack window
export SKIP_SSL_VALIDATION=true # if self-signed cert is in use
epxort SMOKE_START_TIMEOUT=<start-timeout>
epxort SMOKE_TOTAL_TIMEOUT=<total-timeout>
```

Then:

```bash
cd cf-abacus
yarn provision
cd test/smoke/process-usage
yarn install
yarn run smoke
```