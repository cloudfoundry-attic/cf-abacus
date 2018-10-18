CF-Abacus
===

The Abacus usage metering and aggregation service.

[![Build Status](https://travis-ci.org/cloudfoundry-incubator/cf-abacus.svg)](https://travis-ci.org/cloudfoundry-incubator/cf-abacus)
[![codecov](https://codecov.io/gh/cloudfoundry-incubator/cf-abacus/branch/master/graph/badge.svg)](https://codecov.io/gh/cloudfoundry-incubator/cf-abacus)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/544255c3788840aaa2402aa7f5cc4eb9)](https://www.codacy.com/app/cf-abacus/cf-abacus?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=cloudfoundry-incubator/cf-abacus&amp;utm_campaign=Badge_Grade)
[![slack.cloudfoundry.org](https://slack.cloudfoundry.org/badge.svg)](https://slack.cloudfoundry.org) [![Greenkeeper badge](https://badges.greenkeeper.io/cloudfoundry-incubator/cf-abacus.svg)](https://greenkeeper.io/)

Overview
---

Abacus provides usage metering and aggregation for [Cloud Foundry (CF)](https://www.cloudfoundry.org) services. It is implemented as a set of REST micro-services that collect usage data, apply metering formulas, and aggregate usage at several levels within a Cloud Foundry organization.

Abacus is implemented in Node.js and the different micro-services can run as CF apps.

This diagram shows the main Abacus services and their role in the processing of usage data. It also shows the services you can deploy around Abacus to integrate it into your Cloud platform.

![Abacus flow diagram](doc/flow.png)

Abacus provides a REST API allowing Cloud service providers to submit usage data, and a REST API allowing usage dashboards, and billing systems to retrieve usage reports. The Abacus REST API is described in [doc/api.md](doc/api.md).

For presentations related to CF-Abacus, see the [presentations](doc/presentations.md) page.

Frequently Asked Questions (FAQs)
---

The Abacus FAQ can be found in [doc/faq.md](doc/faq.md).

Building
---

Abacus requires Node.js >= 8.10.0, Yarn > 1.3.2, MongoDB >= 3.4 and RabbitMQ >= 3.6

```sh
cd cf-abacus

# Start local mongodb and rabbitmq-server
docker-compose up

# Use local MongoDB
. ./bin/localdb

# Bootstrap the build environment
# install the Node.js module dependencies and run the tests
yarn run build
```

Running Abacus on localhost
---

The Abacus apps can also run on your local host in a shell environment outside of Cloud Foundry, like this:

```sh
cd cf-abacus

# Use local MongoDB
. ./bin/localdb

# Start the Abacus apps
yarn start

# Wait a bit until all the apps have started

# Run the demo script
yarn run demo

# Stop everything
yarn stop
```

Dependency management
---

Abacus uses `yarn` to fix the versions of a package's dependencies. Fixed dependencies are
persisted in `yarn.lock` file which is located at the same directory where `package.json` file
exists.

Updating dependencies
* Automatically
Dependencies could be updated automatically for the whole repository by executing the steps bellow. As a result
this script will regenerate all lock files.

```sh
cd cf-abacus

# Generates the yarn.lock files
bin/update-dependencies
```

* Manually
If you prefer  to update dependencies of particular module, it is possible to do it manually with the following steps.

```sh
cd cf-abacus/lib/<module>

# Delete existing dependencies
rm -rf node_modules/

# Delete existing lock file
rm yarn.lock

# Install/Update dependency/cies in package.json file either manually or via yarn
yarn add <dependency>

# Add dependency
yarn install
```

Testing
---

```sh
cd cf-abacus

# Use local MongoDB
. ./bin/localdb

# Run eslint on the Abacus modules
yarn run lint

# Run the tests
yarn test
```

For a list of all available tests check [doc/tests.md](doc/tests.md).

Deploying to Cloud Foundry
---

Check our [wiki](https://github.com/cloudfoundry-incubator/cf-abacus/wiki) on how to deploy Abacus to Cloud Foundry.

Layout
---

The Abacus source tree is organized as follows:

```sh

bin/ - Start, stop, demo and cf push scripts

demo/ - Demo apps

    client - demo program that posts usage and gets a report

doc/ - API documentation

lib/ - Abacus modules

    metering/ - Metering services

        collector - receives and collects service usage data
        meter     - applies metering formulas to usage data

    aggregation/ - Aggregation services

        accumulator - accumulates usage over time and applies
                      pricing to accumulated usage
        aggregator  - aggregates usage within an organization and applies
                      pricing to aggregated usage
        reporting   - returns usage reports

    cf/ - CF platform integration

        applications - collects CF app usage data

        renewer - carries over usage from previous month

        services - collects CF service usage data

        broker -  provisions Abacus service instances

        dashboard - provides UI to define and manage the resource provider plans

    config/ - Usage formula and pricing configuration

    utils/ - Utility modules used by the above

    plugins/ - Plugins for provisioning and account services

    extensions/ - Extension healthcheck and housekeeper apps

test/ - Tests

    integration/ - Integration tests which may depend on local MongoDB or RabbitMQ

    scenario/ - End-to-end scenarios using a fully deployed system

    performance/ - Load tests, which require a pre-deployed system

    dependency/ - Tests against remote systems (ones that Abacus depends on) and verify that their API contracts have not changed

tools/ - Build tools

etc/ - Misc build scripts

```

Developing individual Abacus modules
---

As shown in the above Layout section, Abacus consists of a number of Node.js modules under the [lib](lib) directory.

When developing on Abacus you may want to quickly iterate through changes to a single module, and run the tests only for that module rather than rebuilding the whole project each time.

Here are the steps most of us follow when we work on a single module, using the [collector](lib/metering/collector) module as an example.

First, bootstrap your Abacus development environment:

```sh
cd cf-abacus

# Setup the base Node.js tools and dependencies used by the Abacus build
yarn run bootstrap
```

Then install your module's dependencies as usual with yarn:

```sh
cd cf-abacus/lib/metering/collector
yarn install
```

At this point your development cycle boils down to:

```sh
cd cf-abacus/lib/metering/collector

# Run ESLint on your code and run the module's unit tests
yarn test
```

To run the collector app you can do this:

```sh
cd cf-abacus/lib/metering/collector
yarn start
```

To push the app to your Cloud Foundry instance, do this:

```sh
cd cf-abacus/lib/metering/collector
yarn run cfpush
```

Finally, to rebuild everything once you're happy with your module:
```sh
cd cf-abacus

# Important to do at this point as the next step does a git clean
git add <your changes>

# Does a git clean to make sure the build starts fresh
yarn run clean

# Build and unit test all the modules
yarn run build

# Or to run what our Travis-CI build runs, including integration tests
yarn run cibuild
```

People
---

[List of all contributors](https://github.com/cloudfoundry-incubator/cf-abacus/graphs/contributors)

License
---

[Apache License 2.0](LICENSE)
