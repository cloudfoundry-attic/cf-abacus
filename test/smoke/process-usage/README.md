abacus-process-usage-smoke-test
===

:information_source: To run the process usage smoke test export the following environment variables:

```sh
export OBJECT_STORAGE_CLIENT_ID=<prefix>
abacus-object-storage-client
export OBJECT_STORAGE_CLIENT_SECRET=abacus-object-storage-secret
export SYSTEM_CLIENT_ID=<prefix>abacus-system-client
export SYSTEM_CLIENT_SECRET=abacus-secret
export SECURED=true
# optional
export COLLECTOR_URL=https://<prefix>abacus-usage-collector.<domain>
export REPORTING_URL=https://<prefix>abacus-usage-reporting.<domain>
export AUTH_SERVER=https://api.<system domain>
export SECURED=true
export SYSTEM_CLIENT_ID=test-client-id
export SYSTEM_CLIENT_SECRET=test-client-secret
export TIME_WINDOWS_SIZES='{ "D" : 6 }' # if set in accumulator environment
export SLACK=4D # if using non-default slack window
export SKIP_SSL_VALIDATION=true # if self-signed cert is in use
export SMOKE_START_TIMEOUT=<start-timeout>
export SMOKE_TOTAL_TIMEOUT=<total-timeout>
```

Then:

```sh
cd cf-abacus
yarn provision
cd test/smoke/process-usage
yarn install
yarn run smoke
```

:information_source: To get a report about the submitted usage locally use:

```sh
curl http://localhost:9088/v1/metering/organizations/us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/aggregated/usage | jq .
```