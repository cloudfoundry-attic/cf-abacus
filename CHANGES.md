Abacus - Change History
===

The Abacus usage metering and aggregation service.

---

### v0.0.2 - 10/16/2015

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
- Node.js 0.10, 0.12 or 4.0
- CouchDB 1.6 compatible database
- Cloud Foundry v210

---

### v0.0.1 - 07/14/2015

Initial public contribution

