Abacus Tests
===

Unit tests
---

Run the tests with:
```sh
cd cf-abacus

npm test
```

You can also [select the used database](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/conf.md#local-configuration).


End-to-end (integration) tests
---

To run the end-to-end integration tests execute:
```sh
cd cf-abacus

npm run itest
```

See the [conf.md](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/conf.md#local-configuration) on how to set the database.


Smoke test
---

You can run the `smoke` test locally with:
```sh
cd cf-abacus

npm start
npm run smoke
npm stop
```

The smoke test can also verify Abacus, running on Cloud Foundry. It can be configured with command line options. Check the available options with:
```sh
npm run smoke -- --help
```

To run the test against secured Abacus installation on Cloud Foundry set:
```sh
export SECURED=true
export CLIENT_ID=<object-storage client id>
export CLIENT_SECRET=<object-storage client secret>
```

Check the security concept in [security.md](security.md) for details.


Duplicate usage detection test
---

You can run the `dupe` test locally with:
```sh
cd cf-abacus

npm start
npm run smoke
npm stop
```

With Abacus on Cloud Foundry configure the test with the command line options listed here:
```sh
npm run dupe -- --help
```

Set these variables to run the test against secured Abacus on Cloud Foundry:
```sh
export SECURED=true
export CLIENT_ID=<object-storage client id>
export CLIENT_SECRET=<object-storage client secret>
```

Check the security concept in [security.md](security.md) for details.


Pipelines
---

Abacus provides Concourse [pipelines](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/etc/concourse). The test pipeline executes the unit, smoke and dupe tests against the supported databases. The deploy pipeline executes the smoke test to verify that the deployed Abacus works correctly.

