abacus-sampler-smoke-test
===

:information_source: To run the sampler smoke test export the following environment variables:

```bash
export CF_API_URI=
export RECEIVER_URL=
export REPORTING_URL=
export SECURED=true
export SAMPLER_CLIENT_ID=<prefix>abacus-system-client
export SAMPLER_CLIENT_SECRET=abacus-secret
# optional
export SKIP_SSL_VALIDATION=true # if self-signed cert is in use
epxort SMOKE_START_TIMEOUT=<start-timeout>
epxort SMOKE_TOTAL_TIMEOUT=<total-timeout>
```

Then:

```bash
cd cf-abacus
yarn provision
cd test/smoke/sampler
yarn install
yarn run smoke
```
