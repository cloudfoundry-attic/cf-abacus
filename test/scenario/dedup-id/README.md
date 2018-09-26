abacus-dedup-id-scenario-test
===

:information_source: In order to run the dedupi id scenario test, export the following environment variables:

```bash
export SECURED='true'
export SYSTEM_CLIENT_ID=test-client-id
export SYSTEM_CLIENT_SECRET=test-client-secret
export AUTH_SERVER=https://api.<system domain>
export COLLECTOR_URL=https://abacus-usage-collector.<domain>
export REPORTING_URL=https://abacus-usage-reporting.<domain>
# optional
export POLL_INTERVAL=<poll-interval>
```

Then run the following commands:

```bash
cd cf-abacus
yarn provision
cd test/scenario/dedup-id
yarn run scenario
```