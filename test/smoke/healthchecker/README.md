abacus-healthchecker-smoke-test
===

:information_source: To run the healthchecker smoke test export the following environment variables:

```bash
export HEALTHCHECKER_URL=https://<prefix>abacus-healthchecker.<domain>
export HYSTRIX_CLIENT_ID=<prefix>abacus-client
export HYSTRIX_CLIENT_SECRET=abacus-client-secret
# optional
export ABACUS_PREFIX=<prefix>
export SMOKE_START_TIMEOUT=<start-timeout>
export SMOKE_TOTAL_TIMEOUT=<total-timeout>
export SKIP_SSL_VALIDATION=true
export CLIENT_FACING_COMPONENTS= [
  <client-facing-app-1>,
  <client-facing-app-2>,
  ...
]
export INTERNAL_COMPONENTS= [
  <internal-app-1>,
  <internal-app-2>,
  ...
]
```

Then:

```bash
cd cf-abacus
yarn provision
cd test/smoke/healthchecker
yarn install
yarn run smoke
```
