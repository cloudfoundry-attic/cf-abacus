CF-Abacus
===

<!--
The Abacus usage metering and aggregation service.
-->
Abacusはメータリングと集計のためのサービスです。

<!--
Overview
-->
概要
---

<!--
Abacus provides usage metering and aggregation for [Cloud Foundry (CF)](https://www.cloudfoundry.org) services. It is implemented as a set of REST micro-services that collect usage data, apply metering formulas, and aggregate usage at several levels within a Cloud Foundry organization.
-->
Abacusは[Cloud Foundry (CF)](https://www.cloudfoundry.org) のための利用量の計測と集計機能を提供します。
これらはすべてRESTのマイクロサービスとして実装され、Cloud Foundryの組織に閉じた複数のレベルに置ける、利用ログの集約、メータリング方式の適用、および集計機能を提供します。

<!--
Abacus is implemented in Node.js and the different micro-services can run as CF apps.
-->
AbacusはNode.jsで実装されており、さまざまなマイクロサービスがCFアプリとして動きます。

<!--
Abacus provides a REST API allowing Cloud service providers to submit usage data, and a REST API allowing usage dashboards, and billing systems to retrieve usage reports. The Abacus REST API is described in [doc/api.md](doc/api.md).
-->
Abacusはクラウドサービスプロバイダに対して、利用データを登録するためのREST APIを提供します。また、利用量ダッシュボードや、利用量レポートをダウンロードするための課金システムなどを作成するためのREST APIを提供します。Abacus REST APIの詳細は[doc/api-ja.md](doc/api-ja.md)を参照してください。

<!--
Frequently Asked Questions (FAQs)
-->
よくある質問(FAQ)
---

<!--
The Abacus FAQ can be found in [doc/faq.md](doc/faq.md).
-->
AbacusのFAQは[doc/faq-ja.md](doc/faq-ja.md)に記載されています。

<!--
Building
-->
ビルド方法
---

<!--
Abacus requires Npm >= 2.10.1 and Node.js >= 0.10.36.
-->
Abacusは、npm 2.10.1以上、Node.js 0.10.36以上が必要です。

```sh
cd cf-abacus

# Bootstrap the build environment, run Babel on the Javascript sources,
# install the Node.js module dependencies and run the tests
npm run build
```

<!--
Testing
-->
テスト方法
---

```sh
cd cf-abacus

# Run eslint on the Abacus modules
npm run lint

# Run the tests
npm test
```

<!--
Deploying to Cloud Foundry
-->
Cloud Foundryへのデプロイ
---

<!--
Abacus runs as a set of applications deployed to Cloud Foundry. Each application is configured to run in multiple instances for availability and performance. Service usage data is stored in CouchDB databases.
-->
Abacusは、Cloud Foundryにデプロイされた一式のアプリケーションとして動きます。それぞれのアプリケーションは可用性・性能を考慮して複数のインスタンス上で動作するように設定できます。サービス利用データはCouchDBに保存されます。

<!--
This diagram shows the main Abacus apps and their role in the processing of usage data.
-->
この図はAbacusアプリケーションと、利用量を処理する際のロールについて記載したものです。

![Abacus flow diagram](doc/flow.png)

<!--
The following steps assume a local Cloud Foundry deployment created using [Bosh-lite](https://github.com/cloudfoundry/bosh-lite), running on the default local IP 10.244.0.34 assigned by the Bosh-lite CF installation script, and have been tested on CF v210. Please adjust to your particular Cloud Foundry deployment environment.
-->
下記のステップは[Bosh-lite](https://github.com/cloudfoundry/bosh-lite)を用いてローカルのCloud Foundry環境にデプロイし、Bosh-lite CFのインストールスクリプトによってデフォルトのローカルIP 10.244.0.34が割り振られ、CF v210でテストされることを想定しています。適宜、利用するCloud Foundry環境に読み替えて下さい。

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
abacus-usage-collector     started           1/1         512M     512M   abacus-usage-collector.10.244.0.34.xip.io   
abacus-usage-meter         started           1/1         512M     512M   abacus-usage-meter.10.244.0.34.xip.io
abacus-usage-accumulator   started           1/1         512M     512M   abacus-usage-accumulator.10.244.0.34.xip.io   
abacus-usage-aggregator    started           1/1         512M     512M   abacus-usage-aggregator.10.244.0.34.xip.io   
abacus-usage-reporting     started           1/1         512M     512M   abacus-usage-reporting.10.244.0.34.xip.io   
abacus-provisioning-plugin started           1/1         512M     512M   abacus-provisioning-plugin.10.244.0.34.xip.io   
abacus-account-plugin      started           1/1         512M     512M   abacus-account-plugin.10.244.0.34.xip.io   
abacus-pouchserver         started           1/1         1G       512M   abacus-pouchserver.10.244.0.34.xip.io   
```

<!--
 Running the demo on Cloud Foundry
-->
Cloud Foundry上でのデモの実行
---

The Abacus demo runs a simple test program that simulates the submission of usage by a Cloud service provider, then gets a daily report for the usage aggregated within a Cloud Foundry organization.

The demo data is stored in a small in-memory [PouchDB](http://pouchdb.com) test database so the demo is self-contained and you don't need to set up a real CouchDB database just to run it.

Once the Abacus apps are running on your Cloud Foundry deployment, do this:

```sh
cd cf-abacus

# Run the demo script
npm run demo -- \
  --collector https://abacus-usage-collector.10.244.0.34.xip.io \
  --reporting https://abacus-usage-reporting.10.244.0.34.xip.io

# You should see usage being submitted and a usage report for the demo organization

```

<!--
 Running Abacus on localhost
-->
localhostでのAbacusの実行
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
<!--
Meter Cloud Foundry app usage
-->
Cloud Foundryアプリケーションの利用量集計
---

Abacus comes with a CF [bridge](lib/cf/bridge) that acts as a resource provider for Cloud Foundry app runtime usage, reads Cloud Foundry [app usage events](http://apidocs.cloudfoundry.org/runtime-passed/app_usage_events/list_all_app_usage_events.html) and reports usage to the Abacus usage [collector](lib/metering/collector).

In the end the Abacus CF bridge enables you to see runtime usage reports for the apps running on your Cloud Foundry instance. In order to start the bridge follow its [README](lib/cf/bridge/README.md).

<!--
 Layout
-->
レイアウト
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

        bridge - collects CF app usage data

    config/ - Usage formula and pricing configuration

    utils/ - Utility modules used by the above

    plugins/ - Plugins for provisioning and account services

test/ - End to end tests

    perf/ - Performance tests

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

# Run Babel.js to translate EcmaScript6 Javascript to ES5
npm run babel

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
