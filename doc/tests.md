Abacus Tests
===


Unit tests
---

Run the tests with:
```sh
cd cf-abacus

yarn test
```

You can also [select the used database](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/conf.md#local-configuration).


End-to-end (integration) tests
---

To run the end-to-end integration tests execute:
```sh
cd cf-abacus

yarn run itest
```

See the [conf.md](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/conf.md#local-configuration) on how to set the database.


Smoke test
---

You can run the `smoke` test locally with:
```sh
cd cf-abacus

yarn start
yarn run smoke
yarn stop
```

The smoke test can also verify Abacus, running on Cloud Foundry. It can be configured with command line options. Check the available options with:
```sh
yarn run smoke --help
```

To run the test against secured Abacus installation on Cloud Foundry set:
```sh
export SECURED=true
export CLIENT_ID=<object-storage client id>
export CLIENT_SECRET=<object-storage client secret>
```

Check the security concept in [security.md](security.md) for details.


Acceptance test
---

To run the acceptance test against secured Abacus on Cloud Foundry set these variables:
```sh
export ABACUS_PREFIX=acceptance-
export REPORTING_APP=<reporting-app>
export ORG_GUID=<org-guid>
export CF_DOMAIN=<cf-domains>
```

Then run the tests with
```sh
cd cf-abacus

yarn run acceptance
```

The command line options of the acceptance test can be listed with:
```sh
yarn run acceptance --help
```


Performance test
---

You can run the `perf` test locally with:
```sh
cd cf-abacus

yarn start
yarn run perf
yarn stop
```

Check the command line options of the test with:
```sh
yarn run perf --help
```


Pipelines
---

Abacus provides Concourse [pipelines](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/etc/concourse). The test pipeline executes the unit, smoke and dupe tests against the supported databases. The deploy pipeline executes the smoke test to verify that the deployed Abacus works correctly.

