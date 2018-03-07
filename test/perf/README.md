abacus-perf
===

End to end performance tests.

To execute it against running abacus you have to set the following variables:
```bash
export SECURED=true
export OBJECT_STORAGE_CLIENT_ID=abacus-object-storage
export OBJECT_STORAGE_CLIENT_SECRET=s3cret
export SYSTEM_CLIENT_ID=abacus
export SYSTEM_CLIENT_SECRET=s3cret
```

To start a performance test use:
```bash
yarn perf --collector <collector url> --reporting <reporting url> --auth-server <cf api url> --orgs 20000
```

To execute a functional correctness test do:
```bash
# Output the organization post status
export DEBUG=abacus-perf-test
# Run the test
yarn perf --collector <collector url> --reporting <reporting url> --auth-server <cf api url> --orgs 20000 --no-timestamps --limit 20
```