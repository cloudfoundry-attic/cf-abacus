abacus-metering-plans-scenario-test
===

### Resource provider scenario test (provisioning plugin)

:information_source: In order to run the metering plans scenario test against an already set up Abacus, export the following environment variables:

```bash
export AUTH_SERVER=https://api.<system domain>
export COLLECTOR_URL=https://<abacus-prefix>abacus-usage-collector.<domain>
export REPORTING_URL=https://<abacus-prefix>abacus-usage-reporting.<domain>
export PROVISIONING_URL=https://<abacus-prefix>abacus-provisioning-plugin.<domain>
export POLL_INTERVAL=<poll-interval>
export EVENTUALLY_TIMEOUT=<timeout>
export SECURED='true'
export SYSTEM_CLIENT_ID=abacus
export SYSTEM_CLIENT_SECRET=secret

# optional; set if self-signed certificate is used
export SKIP_SSL_VALIDATION=true
```

Then run the following commands:

```bash
cd cf-abacus
yarn provision
cd test/scenario/metiring-plans
yarn run scenario
```