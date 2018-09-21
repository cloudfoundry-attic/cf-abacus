abacus-rabbitmq-integration-test
===

:information_source: In order to run the test locally, make sure you run the following commands:

```bash
cd cf-abacus
yarn provision
docker-compose up -d
source bin/localdb
cd test/integration/utlis/rabbitmq
yarn run integration
```
