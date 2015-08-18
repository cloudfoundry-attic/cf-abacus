CF-Abacus
===

The Abacus usage metering and aggregation service.

[![Build Status](https://travis-ci.org/cloudfoundry-incubator/cf-abacus.svg)](https://travis-ci.org/cloudfoundry-incubator/cf-abacus) [![Coverage Status](https://coveralls.io/repos/cloudfoundry-incubator/cf-abacus/badge.svg?branch=master&service=github)](https://coveralls.io/github/cloudfoundry-incubator/cf-abacus?branch=master) [![Slack Team](https://abacusdev-slack.mybluemix.net/badge.svg)](https://abacusdev-slack.mybluemix.net/) [![Gitter Chat](https://img.shields.io/badge/gitter-join%20chat-blue.svg)](https://gitter.im/cloudfoundry-incubator/cf-abacus?utm\_source=badge) [![IRC Chat](https://img.shields.io/badge/irc-%23abacusdev-blue.svg)](http://webchat.freenode.net?channels=%23abacusdev)

Overview
---

Abacus provides usage metering and aggregation for [Cloud Foundry (CF)](https://www.cloudfoundry.org) services. It is implemented as a set of REST micro-services that collect usage data, apply metering formulas, and aggregate usage at several levels within a Cloud Foundry organization.

Abacus provides a REST API allowing Cloud service providers to submit usage data, and a REST API allowing usage dashboards, and billing systems to retrieve usage reports.

Abacus is implemented in Node.js and the different micro-services can run as CF apps.

The Abacus REST API is described in [doc/api.md](doc/api.md).

Building
---

Abacus requires Npm >= 2.10.1 and Node.js >= 0.10.36 or io.js >= 2.3.0.

```sh
cd cf-abacus

# Bootstrap the build environment, run Babel on the Javascript sources,
# install the Node.js module dependencies and run the tests
npm run build
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

Deploying to Cloud Foundry
---

Abacus runs as a set of applications deployed to Cloud Foundry. Each application is configured to run in multiple instances for availability and performance. Service usage data is stored in CouchDB databases.

This diagram shows the main Abacus apps and their role in the processing of usage data.

![Abacus flow diagram](doc/flow.png)

The following steps assume a local Cloud Foundry deployment created using [Bosh-lite](https://github.com/cloudfoundry/bosh-lite) and running on the default local IP 10.244.0.34 assigned to that deployment. Please adjust to your particular Cloud Foundry deployment environment.

```sh
cd cf-abacus

# Point the CF CLI to your local Cloud Foundry deployment
cf api --skip-ssl-validation https://api.10.244.0.34.xip.io
cf login -o <your organization> -s <your space>

# Create a CF security group for the Abacus apps
cat >abacus_group.json <<EOF
[
  {
    "destination": "10.0.0.0-10.255.255.255",
    "protocol": "all"
  }
]
EOF
cf create-security-group abacus abacus_group.json
cf bind-security-group abacus <your organization> <your space>

# Run cf push on the Abacus apps to deploy them to Cloud Foundry
npm run cfpush

# Check the state of the Abacus apps
cf apps

# You should see something like this
Getting apps in org <your organization> / space <your space>...
OK

name                       requested state   instances   memory   disk   urls   
abacus-usage-collector     started           1/1         512M     512M   abacus-usage-collector.10.244.0.34.xip.io   
abacus-usage-meter         started           1/1         512M     512M   abacus-usage-meter.10.244.0.34.xip.io 
abacus-usage-accumulator   started           1/1         512M     512M   abacus-usage-accumulator.10.244.0.34.xip.io   
abacus-usage-aggregator    started           1/1         512M     512M   abacus-usage-aggregator.10.244.0.34.xip.io   
abacus-usage-reporting     started           1/1         512M     512M   abacus-usage-reporting.10.244.0.34.xip.io   
abacus-dbserver            started           1/1         1G       512M   abacus-dbserver.10.244.0.34.xip.io   
```

Running the demo
---

The Abacus demo runs a simple test program that simulates the submission of usage by a Cloud service provider, then gets a daily report for the usage aggregated within a Cloud Foundry organization.

The demo data is stored in a small in-memory [PouchDB](http://pouchdb.com) test database so the demo is self-contained and you don't need to set up a real CouchDB database just to run it.

Once the Abacus apps are running on your Cloud Foundry deployment, do this:

```sh
cd cf-abacus

# Run the demo script
npm run demo \
  --collector https://abacus-usage-collector.10.244.0.34.xip.io \
  --reporting https://abacus-usage-reporting.10.244.0.34.xip.io

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

        accumulator - accumulates usage over time
        aggregator  - aggregates usage within an organization
        reporting   - returns usage reports

    config/ - Usage formula configuration
    
    rating/ - Rating services
    
        rate - applies pricing formulas to usage

    utils/ - Utility modules used by the above

    stubs/ - Test stubs for provisioning and account services

test/ - End to end tests

    perf/ - Performance tests

tools/ - Build tools

etc/ - Misc build scripts

```

People
---

[List of all contributors](https://github.com/cloudfoundry-incubator/cf-abacus/graphs/contributors)

License
---

  [Apache License 2.0](LICENSE)

