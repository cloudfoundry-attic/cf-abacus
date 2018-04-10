To run the broker acceptance test export the following:

```bash
export CF_API=https://api.<domain>
export CF_ADMIN_USER=admin
export CF_ADMIN_PASSWORD=admin
export SKIP_SSL_VALIDATION=true
export BROKER_TEST_ORG=<org>
export CF_SPACE=<space>
export COLLECTOR_URL=https://abacus-usage-collector.<domain>
export REPORTING_URL=https://abacus-usage-reporting.<domain>
export PROVISIONING_URL=https://abacus-provisioning-plugin.<domain>
export SERVICE_NAME=metering
export SERVICE_PLAN=standard
```

Then:

```bash
cd cf-abacus
yarn provision
cd test/broker
yarn install
yarn run acceptance
```
