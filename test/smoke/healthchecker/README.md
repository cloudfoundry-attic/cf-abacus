abacus-healthchecker-smoke-test
===

Healthchecker smoke tests

To run the healthchecker smoke test export the following:

```bash
export HEALTHCHECKER_URL=https://<prefix>abacus-healthchecker.<domain>
export HYSTRIX_CLIENT_ID=abacus-client
export HYSTRIX_CLIENT_SECRET=abacus-client-secret
# optional
export ABACUS_PREFIX=<prefix>
export HEALTHCHECKER_START_TIMEOUT=<timeout>
export HEALTHCHECKER_TOTAL_TIMEOUT=<timeout>
export SKIP_SSL_VALIDATION=true
```

Then:

```bash
cd cf-abacus
yarn provision
cd test/smoke/healthchecker
yarn install
yarn run smoke
```
