abacus-sampler-smoke-test
===

:information_source: To run the sampler smoke test export the following environment variables:

```bash
export CF_API_URI=https://api.<domain>
export RECEIVER_URL=https://<prefix>abacus-sampler-receiver.<domain>
export REPORTING_URL=https://<prefix>abacus-usage-reporting.<domain>
export SAMPLER_CLIENT_ID=<prefix>abacus-sampler
export SAMPLER_CLIENT_SECRET=s3cret
export SYSTEM_CLIENT_ID=<prefix>abacus
export SYSTEM_CLIENT_SECRET=s3cret
export SECURED=true
# optional
export SKIP_SSL_VALIDATION=true # if self-signed cert is in use
export SMOKE_TOTAL_TIMEOUT=<total-timeout>
export POLL_INTERVAL=<interval>
```

Then:

```bash
cd cf-abacus
yarn provision
cd test/smoke/sampler
yarn install
yarn run smoke
```
