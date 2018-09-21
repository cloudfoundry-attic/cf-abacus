abacus-collector-integration-test
===

:information_source: In order to run the test locally, make sure you run the following commands:

```bash
cd cf-abacus
docker-compose up -d
source bin/localdb
yarn provision
cd test/integration/metering/collector
yarn run integration
```
