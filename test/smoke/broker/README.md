To run the broker smoke test export the following:

```bash
export CF_API_URI=https://api.<domain>
export CF_ADMIN_USER=admin
export CF_ADMIN_PASSWORD=admin
export BROKER_TEST_ORG=<org>
export CF_SPACE=<space>
export APPS_DOMAIN=<apps domain>
export COLLECTOR_URL=https://abacus-usage-collector.<domain>
export REPORTING_URL=https://abacus-usage-reporting.<domain>
export SERVICE_NAME=metering
export SERVICE_PLAN=standard
# optional
export TOTAL_TIMEOUT=<timeout>
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
