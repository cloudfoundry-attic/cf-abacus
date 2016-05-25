Abacus - Change History
===

The Abacus usage metering and aggregation service.

---

### v0.0.5 - 05/25/2016

##### Usage metering and rating
- refactor provisioning config and account plugins
- improve flexibility of metering, rating, and pricing plans
- persist last submitted runtime usage GUID
- detect conflicting runtime usage events
- improve error reporting
- store usage processing errors in a separate DB

##### Usage accumulation and aggregation
- refactor time window processing using moment.js
- fixes to time window based usage accumulation
- support out of sequence time-based usage events
- remove consumers without usage from aggregated usage
- support variable usage slack window
- improve duplicate usage doc detection

##### Usage reporting
- improve GraphQL error reporting
- support user-defined quantities and costs in GraphQL reports

##### Deployment
- new Concourse build and test pipeline
- pluggable database support
- support both CouchDB and MongoDB databases
- improved pipeline configuration documentation
- improved security configuration documentation

##### Security
- secure /log, /healthcheck and /hystrix routes 
- refactor CF bridge OAuth support
- secure CF bridge routes
- fix OAuth token refresh logic

##### Performance
- improve CF bridge performance

##### Misc
- add useful error logging

##### Prerequisites
- Node.js 5.10, 6.2
- Npm 3.8
- CouchDB 1.6+ compatible database or MongoDB 3.2+ database
- Cloud Foundry v226+

### v0.0.5-rc.1 - 03/07/2016

##### Usage metering and rating
- refactor provisioning config and account plugins
- improve flexibility of metering, rating, and pricing plans
- persist last submitted runtime usage GUID

##### Usage accumulation and aggregation
- refactor time window processing
- fixes to time window based usage accumulation
- support out of sequence time-based usage events
- remove consumers without usage from aggregated usage
- support variable usage slack window

##### Usage reporting
- improve GraphQL error reporting
- support user-defined quantities and costs in GraphQL reports

##### Deployment
- pluggable database support
- support both CouchDB and MongoDB databases
- improved pipeline configuration documentation
- improved security configuration documentation

##### Security
- secure /log routes
- refactor CF bridge OAuth support
- secure CF bridge routes

##### Performance
- improve CF bridge performance

##### Misc
- add useful error logging

##### Prerequisites
- Node.js 0.12, 4.2, 5.6
- CouchDB 1.6+ compatible database or MongoDB 3.2+ database
- Cloud Foundry v210+

---

### v0.0.5-rc.0 - 02/02/2016

##### Usage metering and rating
- Refactor plugins to use separate metering, rating and pricing plans

##### Misc
- Database client fixes

---

### v0.0.4 - 12/21/2015

##### Usage collection
- Handle runtime usage GUID resets

##### Usage metering and rating
- Metering and rating configuration at the resource/plan level
- Usage rating at the resource instance level
- Remove separate rating service
- Disable BigNumber errors with more than 15 significant digits

##### Usage accumulation and aggregation
- Fixes to time window and slack window processing logic
- Refactor and simplify aggregation processing
- Include account id in aggregated usage
- Remove deprecated region property
- Optionally post aggregated usage to an external service

##### Deployment
- Upgrade to latest Node dependencies
- Improve BOSH release creation and deployment scripts
- Improve performance of deployment to CF

##### Monitoring
- Monitoring of Abacus services using Hystrix, Eureka and Turbine
- Config options and instrumentation to help monitor memory usage
- Fix service health reporting logic

##### Security
- Refactor and simplify OAuth support module
- Don't write passwords to debug log

##### Performance
- Improve memory usage and fix memory leaks
- Tune throttling and cache sizes
- Implement usage processing backpressure 
- Minimize number of usage replays when recovering

##### Prerequisites
- Node.js 0.12, 4.2, 5.3
- CouchDB 1.6+ compatible database
- Cloud Foundry v210+

### v0.0.3 - 11/06/2015

##### Usage submission
- Scoped organization ids (e.g. per deployment, region, zone etc)
- Optionally replay unprocessed usage after a restart

##### Usage metering and rating
- Accurate floating point calculations using BigNumber.js

##### Usage accumulation
- Fix remaining timing and event sequencing issues in tests

##### Deployment
- Several small/medium/large deployment config options
- Prototype of a BOSH release for Abacus

##### Documentation
- Japanese translation

##### Misc
- Performance optimizations, latency and memory footprint

##### Prerequisites
- Node.js 0.12, 4.2, 5.0
- CouchDB 1.6+ compatible database
- Cloud Foundry v210+

---

### v0.0.2 - 10/30/2015

##### Usage submission
- Accept and record duplicate usage docs
- Fix issue with db partitioning in provisioning service

##### Usage accumulation
- Fix timing and event sequencing issues in tests

##### App usage metering
- Fix detection of duplicate usage docs with multiple consumers

##### Misc
- App health checks based on error rates
- Optional registration in Eureka for monitoring with Hystrix
- Support easier app environment configuration with .rc files

##### Prerequisites
- Node.js 0.12, 4.2
- CouchDB 1.6 compatible database
- Cloud Foundry v210+

---

### v0.0.2-rc.2 - 10/23/2015

##### Usage submission
- Change consumer field type to a string
- Improve error reporting
- Store provider client id with submitted usage

##### Usage accumulation
- Bug fixes with usage accumulation and slack windows
- Improve reliability of duplicate usage doc detection

##### Usage reports
- Fix handling of undefined usage values

##### App usage metering
- Improvements to make test logic independent of timing
- Throttle usage submission at startup time

##### Security
- Pass Abacus token instead of client token to resource config service
- Add a test UAA stub service allowing all tests to run with security
- Use more consistent config variable names

##### Performance improvements
- Faster duplicate usage doc detection
- Reduced number of database writes per usage doc
- Fixed Node.js IO starvation issues under load

##### Misc
- More flexible database name configuration
- More flexible database partitioning configuration

##### Prerequisites
- Node.js 0.10, 0.12, 4.2
- CouchDB 1.6 compatible database
- Cloud Foundry v210+

---

### v0.0.2-rc.1 - 10/16/2015

##### Usage submission
- Simpler and more consistent usage submission API
- Single usage model for runtime and service resources
- Pluggable usage validation

##### Usage accumulation
- Usage accumulation over month, day, hour, min, sec time windows
- Configurable accumulation functions
- Automatic calculation of time-based usage consumption
- Handling of out of sequence and delayed usage

##### Usage aggregation
- Usage aggregation over orgs, spaces, resources, consumers and apps
- Configurable aggregation functions

##### Usage rating
- Rating of aggregated usage
- Configurable pricing and rating functions

##### Usage reports
- Simpler and more consistent usage reporting API
- Default usage summary reports
- Configurable summary and charge calculation functions
- GraphQL usage query API

##### Platform integration and onboarding
- Pluggable resource provider and resource configuration onboarding
- Pluggable org collection management

##### Security
- Authentication using OAuth tokens
- Usage submission authorization using OAuth scopes
- Pluggable usage reporting authorization

##### App usage metering
- CF app usage bridge to Abacus

##### Documentation
- Improvements to the API doc
- FAQ with a few initial questions

##### Misc
- Support for usage region info
- Performance improvements
- DB error handling improvements
- Increased test coverage
- Integration and performance tests

##### Prerequisites
- Node.js 0.10, 0.12, 4.2
- CouchDB 1.6 compatible database
- Cloud Foundry v210+

---

### v0.0.1 - 07/14/2015

Initial public contribution

