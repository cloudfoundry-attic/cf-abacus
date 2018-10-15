abacus-performance-test
===


:information_source: In order to run the performance test, against an already set up Abacus, export the following environment variables:

```bash
export ORGS=<number-of-orgs>
export INSTANCES=<number-of-instances>
export USAGE_DOCS=<number-of-usage-docs>

export COLLECTOR_URL=https://<prefix>abacus-usage-collector.<domain>
export REPORTING_URL=https://<prefix>abacus-usage-reporting.<domain>
export AUTH_SERVER=https://api.<system domain>

export SECURED=true
export OBJECT_STORAGE_CLIENT_ID=abacus-object-storage
export OBJECT_STORAGE_CLIENT_SECRET=s3cret
export SYSTEM_CLIENT_ID=abacus
export SYSTEM_CLIENT_SECRET=s3cret
# optional
export PLAN_TYPE=<plan>
export PERFORMANCE_START_TIMEOUT=<timeout>
export PERFORMANCE_TOTAL_TIMEOUT=<timeout>
export PROCESSING_TIMEOUT=<timeout>
export DELTA=<usage-time-window-shift-in-milli-seconds>
export NUMBER_EXECUTIONS=<number-of-test-executions>
export LIMIT=<number-of-parallel-requests>
export NO_TIMESTAMP=true # do not add timestamp to org names
export SKIP_SSL_VALIDATION=true # if you need to skip ssl validation
```

Then run the following commands:

```bash
cd cf-abacus
yarn provision
cd test/performance
yarn run performance
```

:information_source: To execute a functional correctness test do:
```bash
# Output the organization post status
export DEBUG=abacus-performance-test
# Run the test
export COLLECTOR_URL=https://<prefix>abacus-usage-collector.<domain>
export REPORTING_URL=https://<prefix>abacus-usage-reporting.<domain>
export AUTH_SERVER=https://api.<system domain>
export ORGS=20000
export NO_TIMESTAMP=true
export LIMIT=20

yarn run performance
```
