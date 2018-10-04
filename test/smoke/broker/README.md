abacus-broker-smoke-test
===

:information_source:  To run the broker smoke test export the following environment variables:

```bash
export CF_API_URI=https://api.<domain>
export CF_ADMIN_USER=admin
export CF_ADMIN_PASSWORD=admin
export CF_BROKER_SMOKE_ORG=<org>
export CF_BROKER_SMOKE_SPACE=<space>
export APPS_DOMAIN=<apps domain>
export COLLECTOR_URL=https://<prefix>abacus-usage-collector.<domain>
export REPORTING_URL=https://<prefix>abacus-usage-reporting.<domain>
export SERVICE_NAME=<prefix>metering
export SERVICE_PLAN=standard
# optional
export SMOKE_TOTAL_TIMEOUT=<total-timeout>
export SKIP_SSL_VALIDATION=true
```

Then:

```bash
cd cf-abacus
yarn provision
cd test/smoke/broker
yarn install
yarn run smoke
```
