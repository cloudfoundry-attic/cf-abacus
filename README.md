CF-Abacus
===

The Abacus usage metering and aggregation service.

[![Build Status](https://travis-ci.org/cloudfoundry-incubator/cf-abacus.svg)](https://travis-ci.org/cloudfoundry-incubator/cf-abacus)
[![codecov](https://codecov.io/gh/cloudfoundry-incubator/cf-abacus/branch/master/graph/badge.svg)](https://codecov.io/gh/cloudfoundry-incubator/cf-abacus)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/544255c3788840aaa2402aa7f5cc4eb9)](https://www.codacy.com/app/cf-abacus/cf-abacus?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=cloudfoundry-incubator/cf-abacus&amp;utm_campaign=Badge_Grade)
[![Slack Team](https://abacusdev-slack.mybluemix.net/badge.svg)](https://abacusdev-slack.mybluemix.net/)
[![Gitter Chat](https://img.shields.io/badge/gitter-join%20chat-blue.svg)](https://gitter.im/cloudfoundry-incubator/cf-abacus?utm\_source=badge)
[![IRC Chat](https://img.shields.io/badge/irc-%23abacusdev-blue.svg)](http://webchat.freenode.net?channels=%23abacusdev)

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

Abacus requires LTS Node.js (6.x and 8.x) and Npm < 5.0.0.

```sh
cd cf-abacus

# Bootstrap the build environment
# install the Node.js module dependencies and run the tests
npm run build
```

Running Abacus on localhost
---

The Abacus apps can also run on your local host in a shell environment outside of Cloud Foundry, like this:

```sh
cd cf-abacus

# Start the Abacus apps
npm start

# Wait a bit until all the apps have started

# Run the demo script
npm run demo

# Stop everything
npm stop
```

Dependency management
---

Abacus uses `npm shrinkwrap` to fix the versions of a package's dependencies. Fixed dependecies are
persisted in `npm-shrinkwrap.json` file which is located at the same directory where `package.json` file
exsists.

Updating dependencies
* Automaticaly
Dependencies could be updated automatically for the whole repository by executing the steps bellow. As a result
this script will regenerate all shrinkwrap files.

```sh
cd cf-abacus

# Generates the corresponding npm-shrinkwrap.json files
bin/module-update
```

* Manually
If you prefer  to update dependencies of particular module, it is possble to do it manually with the following steps.

```sh
cd cf-abacus/lib/<module>

# Delete existing dependencies
rm -rf node_modules/

# Delete existing shrinkwrap file
rm npm-shrinkwrap.json

# Install/Update dependency/cies in package.json file either manually or via npm
npm install <dependency> --save
or
npm update <dependency> --save

# Install dependencies
npm install

# Generate shrinkwrap files
npm shrinkwrap
```

Testing
---

```sh
cd cf-abacus

# Run eslint on the Abacus modules
npm run lint

# Run the tests
npm test
```

For a list of all available tests check [doc/tests.md](doc/tests.md).

Deploying to Cloud Foundry
---

Check our [wiki](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Installation) on how to deploy Abacus to Cloud Foundry.

Concourse pipelines
---

You can use Concourse [pipelines](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/etc/concourse) to test, deploy and monitor Abacus.


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

    config/ - Usage formula and pricing configuration

    utils/ - Utility modules used by the above

    plugins/ - Plugins for provisioning and account services

test/ - End to end tests

    perf/ - Performance tests

tools/ - Build tools

etc/ - Misc build scripts

    concourse/ - Concourse pipelines

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
npm run bootstrap
```

Then install your module's dependencies as usual with npm:

```sh
cd cf-abacus/lib/metering/collector
npm install
```

At this point your development cycle boils down to:

```sh
cd cf-abacus/lib/metering/collector

# Run ESLint on your code and run the module's unit tests
npm test
```

To run the collector app you can do this:

```sh
cd cf-abacus/lib/metering/collector
npm start
```

To push the app to your Cloud Foundry instance, do this:

```sh
cd cf-abacus/lib/metering/collector
npm run cfpush
```

Finally, to rebuild everything once you're happy with your module:
```sh
cd cf-abacus

# Important to do at this point as the next step does a git clean
git add <your changes>

# Does a git clean to make sure the build starts fresh
npm run clean

# Build and unit test all the modules
npm run build

# Or to run what our Travis-CI build runs, including integration tests
npm run cibuild
```

People
---

[List of all contributors](https://github.com/cloudfoundry-incubator/cf-abacus/graphs/contributors)

License
---

  [Apache License 2.0](LICENSE)
