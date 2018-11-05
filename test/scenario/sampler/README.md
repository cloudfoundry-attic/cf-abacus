abacus-sampler-scenario-test
===

:information_source: In order to run the sampler scenario test, export the following environment variables:

```bash
export CF_API_URI=https://api.<domain>
export RECEIVER_URL=https://<prefix>abacus-sampler-receiver.<domain>
export REPORTING_URL=https://<prefix>abacus-usage-reporting.<domain>
export SAMPLER_CLIENT_ID=<prefix>abacus-sampler
export SAMPLER_CLIENT_SECRET=<secret>
export SYSTEM_CLIENT_ID=<prefix>abacus
export SYSTEM_CLIENT_SECRET=<secret>
export SECURED=true
# optional
export SKIP_SSL_VALIDATION=true # if self-signed cert is in use
export TOTAL_TIMEOUT=<total-timeout>
export POLL_INTERVAL=<interval>
```

Then run the following commands:

```bash
cd cf-abacus
yarn provision
cd test/scenario/sampler
yarn run scenario
```
