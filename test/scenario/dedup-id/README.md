abacus-dedup-id-scenario-test
===

### Dedup id scenario test

To run this test against an already set-up and functioning abacus instance, set the following environment variables:

```bash
export SECURED='true'
export SYSTEM_CLIENT_ID=test-client-id
export SYSTEM_CLIENT_SECRET=test-client-secret
export AUTH_SERVER=https://uaa.<system domain>
export COLLECTOR_URL=https://abacus-usage-collector.<domain>
export REPORTING_URL=https://abacus-usage-reporting.<domain>
export POLL_INTERVAL=<poll-interval>
```
