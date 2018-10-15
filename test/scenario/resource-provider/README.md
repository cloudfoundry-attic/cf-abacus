abacus-resource-provider-scenario-test
===

:information_source: In order to run the resource provider scenario test, export the following environment variables:

```bash
export CF_API_URI=https://api.<system domain>
export AUTH_SERVER_URL=https://uaa.<system domain>
export CF_ADMIN_USER=admin
export CF_ADMIN_PASSWORD=password
export CF_ORG=<organization to use>
export CF_SPACE=<space to use for testing>
export CLIENT_SECRET=test-secret
export COLLECTOR_URL=https://<abacus-prefix>abacus-usage-collector.<domain>
export REPORTING_URL=https://<abacus-prefix>abacus-usage-reporting.<domain>
export PROVISIONING_URL=https://<abacus-prefix>abacus-provisioning-plugin.<domain>
export SYSTEM_CLIENT_ID=abacus
export SYSTEM_CLIENT_SECRET=secret
export UAA_SECRET=<UAA admin secret>

# optional; set if self-signed certificate is used
export SKIP_SSL_VALIDATION=true
export WAIT_TIMEOUT=<timeout>
```

Then run the following commands:

```bash
cd cf-abacus
yarn provision
cd test/scenario/resource-provider
yarn run scenario
```