abacus-eureka-integration-test
===

:information_source: In order to run the test locally, make sure you run the following commands:

```bash
cd cf-abacus
docker-compose up -d
yarn provision
cd test/integration/plugins/eureka
yarn run integration
```
