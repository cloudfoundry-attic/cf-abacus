CF-Abacus
===

The Abacus usage metering and aggregation service.

[![Build Status](https://travis-ci.org/cloudfoundry-incubator/cf-abacus.svg)](https://travis-ci.org/cloudfoundry-incubator/cf-abacus)
[![Coverage Status](https://coveralls.io/repos/cloudfoundry-incubator/cf-abacus/badge.svg?branch=master&service=github)](https://coveralls.io/github/cloudfoundry-incubator/cf-abacus?branch=master)
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

Abacus requires Node.js >= 6.10.0 and Npm >= 3.10.10.

```sh
cd cf-abacus

# Bootstrap the build environment
# install the Node.js module dependencies and run the tests
npm run build
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

Abacus runs as a set of applications deployed to Cloud Foundry. Each application is configured to run in multiple instances for availability and performance. Service usage data is stored in CouchDB databases.

The following steps assume a local Cloud Foundry deployment created using [Bosh-lite](https://github.com/cloudfoundry/bosh-lite), running on the default local IP assigned by the Bosh-lite CF installation script, and have been tested on CF v226.4. Please adjust to your particular Cloud Foundry deployment environment.

```sh
cd cf-abacus

# Point CF CLI to your local Cloud Foundry deployment and
# create a CF security group for the Abacus apps
bin/cfsetup

# Run cf push on the Abacus apps to deploy them to Cloud Foundry
npm run cfpush

# Check the state of the Abacus apps
cf apps

# You should see something like this
Getting apps in org <your organization> / space <your space>...
OK

name                       requested state   instances   memory   disk   urls   
abacus-usage-collector     started           1/1         512M     512M   abacus-usage-collector.both-lite.com   
abacus-usage-meter         started           1/1         512M     512M   abacus-usage-meter.both-lite.com
abacus-usage-accumulator   started           1/1         512M     512M   abacus-usage-accumulator.both-lite.com   
abacus-usage-aggregator    started           1/1         512M     512M   abacus-usage-aggregator.both-lite.com   
abacus-usage-reporting     started           1/1         512M     512M   abacus-usage-reporting.both-lite.com   
abacus-provisioning-plugin started           1/1         512M     512M   abacus-provisioning-plugin.both-lite.com   
abacus-account-plugin      started           1/1         512M     512M   abacus-account-plugin.both-lite.com   
abacus-pouchserver         started           1/1         1G       512M   abacus-pouchserver.both-lite.com   
```

Running the demo on Cloud Foundry
---

The Abacus demo runs a simple test program that simulates the submission of usage by a Cloud service provider, then gets a daily report for the usage aggregated within a Cloud Foundry organization.

The demo data is stored in a small in-memory [PouchDB](http://pouchdb.com) test database so the demo is self-contained and you don't need to set up a real CouchDB database just to run it.

Once the Abacus apps are running on your Cloud Foundry deployment, do this:

```sh
cd cf-abacus

# Run the demo script
npm run demo -- \
  --collector https://abacus-usage-collector.both-lite.com \
  --reporting https://abacus-usage-reporting.both-lite.com

# You should see usage being submitted and a usage report for the demo organization

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

Metering Cloud Foundry app usage
---

Abacus comes with a CF [app bridge](lib/cf/applications) and [services bridge](lib/cf/services) that act as resource providers for Cloud Foundry app and service runtime usage. They read Cloud Foundry [usage events](https://docs.cloudfoundry.org/running/managing-cf/usage-events.html) using Cloud Controller [API](http://apidocs.cloudfoundry.org/) and reports usage to the Abacus usage [collector](lib/metering/collector).

The Abacus CF bridges enables you to see runtime usage reports for the apps running on your Cloud Foundry instance. In order to start the bridge follow their README [here](lib/cf/applications/README.md) and [here](lib/cf/services/README.md).

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
