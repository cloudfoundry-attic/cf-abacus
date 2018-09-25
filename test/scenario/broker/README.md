abacus-broker-scenario-test
===

:information_source: In order to run the broker scenario test, export the following environment variables:

```bash
export CF_API_URI=https://api.<domain>
export CF_USER=<prefix>abacus
export CF_PASSWORD=<password>
export CF_ORG=<org>
export CF_BROKER_SCENARIO_SPACE=<space>
export COLLECTOR_URL=https://<prefix>abacus-usage-collector.<domain>
export REPORTING_URL=https://<prefix>abacus-usage-reporting.<domain>
export PROVISIONING_URL=https://<prefix>abacus-provisioning-plugin.<domain>
export SERVICE_NAME=metering
export SERVICE_PLAN=standard
# optional
export TOTAL_TIMEOUT=<timeout>
export SKIP_SSL_VALIDATION=true
```

Then run the following commands:

```bash
cd cf-abacus
yarn provision
cd test/scenario/broker
yarn run scenario
```
