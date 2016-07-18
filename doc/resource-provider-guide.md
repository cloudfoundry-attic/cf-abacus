# Abacus

## Overview

Abacus provides usage metering and aggregation for [Cloud Foundry (CF)](https://www.cloudfoundry.org) services. It is implemented as a set of REST micro-services that collect usage data, apply metering formulas, and aggregate usage at several levels within a Cloud Foundry organization.

Abacus provides a REST API allowing Cloud service providers to submit usage data, and a REST API allowing usage dashboards, and billing systems to retrieve usage reports. The Abacus REST API is described in [doc/api.md](doc/api.md).

## Roles

Here is a list of the roles we'll use in the guide:

* **Cloud Foundry Operator**

   The Operator is responsible for the day-to-day operation of Cloud Foundry. A small subset of the responsibilities of the Operator:
   * create/modify resources (organizations, spaces, quotas, services) needed for Abacus or the Resource providers
   * scale Cloud Foundry installation to fit usage requirements
   * update parts of the Cloud Foundry landscape:
       * build packs (new runtimes)
       * stem cells (OS or security fixes)
       * infrastructure services (Diego, ELK)
       * marketplace services

   The responsibilities above are often shared between several teams, organizations and even companies. For example we might have:
   * CloudOps (Amazon, Google Cloud, Azure, OpenStack operation)
   * Cloud Foundry operators (CF operation)
   * DevOps teams (operating infra and user-facing services)

* **User**

   The customer uses software (SaaS), applications (PaaS) or resources (IaaS) from the Cloud Foundry system. The User is charged for the used resources.

* **Abacus Integrator**

   The Abacus integrator is responsible for the correct functioning of the Abacus components. The integrator is also responsible for the integration and functioning of the Abacus pipeline with Cloud Foundry. The integrator takes care to request (from CF Operators), monitor and provision the needed memory, network and database resources for Abacus.
   The integrator also takes care for any integrations with services you can deploy around Abacus, such as monitoring, logging, auditing, BPEM processes, billing system and usage analytics.

* **Resource Provider**

   The Resource Provider, as suggested by the name is responsible for providing resources to the users. To meter the resource usage, each Resource Provider shall submit usage documents to Abacus.

* **Report Consumer**

   The Report Consumer can request an usage report from Abacus. This report can be presented directly to the User or used to feed external systems like monitoring or billing.

   This diagram shows the Provider and Consumer roles:

   ![Resource Provider diagram](provider-consumer.png)



# Measures and Metrics

## What is a measure?

**Measure** can be defined as "the determination or estimation of ratios of quantities" [1] or "the extent, dimensions, quantity, etc., of something, ascertained especially by comparison with a standard" [2]

Measures are the raw data that we submit to Abacus. Each measures consists of multiple entries, each of them associated with a name and unit.

Abacus project has an [object store example](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-object-storage.js). Inside you can find several measures:
```javascript
{
  name: 'storage',
  unit: 'BYTE'
},
{
  name: 'light_api_calls',
  unit: 'CALL'
}
```

We can submit to Abacus a measure that has 10 storage units (bytes) and 5 light api calls.

## What is a metric?

While the measures represent the raw data, the metrics combine and derive something out of the data.

As we already said the raw data is submitted to Abacus so it can meter and aggregate the measures into metrics.

In the [object store example](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-object-storage.js) we have several metrics:
```
{
  name: 'storage',
  unit: 'GIGABYTE',
  ....
},
{
  name: 'thousand_light_api_calls',
  unit: 'THOUSAND_CALLS',
  ...
}
```

The metrics above first convert the measures to gigabytes and thousands of calls and then combines them to derive a quantifiable value.

The metrics can produce simple numbers or compound data structures, if they need to keep state, or to perform some complex processing.

### Functions

To combine the measures into metrics a resource provider can define 6 Javascript functions: `meter`, `accumulate`, `aggregate`, `rate`, `summarize` and `charge`.

The Abacus processing pipeline is a simple composition that can be expressed like

`charge(…, summarize(…, rate(aggregate(..., accumulate(..., meter(usage)))))))`

The functions usually work with BigNumber to allow higher precision of the result.

#### meter

A "map" function, responsible for transforming a raw measure into the unit used for metering.
* input:
   * `m`: submitted measure
* output metered measure

In our example, we want to meter thousands of API calls so our meter function will map the measure `x` to `x / 1000`:
```javascript
 (m) => new BigNumber(m.storage).div(1073741824).toNumber()).toString()
```

The function often does rounding or similar operations as well.

#### accumulate

Accumulate is a "reduce" function, responsible for accumulating metered usage over time.
* input:
   * `a`: accumulated result so far
   * `qty`: current measure
   * `start`:
   * `end`:
   * `from`:
   * `to`:
   * `twCell`: time-window cell
* output: new accumulated result

A typical use is a sum of all metered usage for a resource instance over time.

The function is often implemented as max over the given period of time for example. For example the object store finds the max memory used by the storage:
```javascript
((a, qty, start, end, from, to, twCell) => end < from || end >= to ? null : Math.max(a, qty)).toString()
```

#### aggregate

A "reduce" function, responsible for aggregating usage in Cloud Foundry entities (space and organization), instead of time.
* input:
   * `a`: aggregateed result so far
   * `prev`: previous aggregateed result
   * `curr`: current measure
   * `aggTwCell`: aggregation time-window cell
   * `accuTwCell`: accumulation time-window cell
* output: new aggregated result

Usually used to add up usage from:
* different service instances under a service,
* all the service instances under a space/app/org, etc

In most cases the function sums the measures as in our object store example:
```javascript
((a, prev, curr, aggTwCell, accTwCell) => new BigNumber(a || 0).add(curr).sub(prev).toNumber()).toString()
```

#### rate

Simple 'map' function, responsible for converting an aggregated usage into a cost. This can be done at various levels: service instance, plan, app, space, org etc.
* input:
   * `price`: price
   * `qty`: measure
* output: cost

A typical rate function will just multiply the metered usage by a price to get the cost, but you can also use more sophisticated rate functions for clip levels, pro-rating etc.

The [object store rating plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/rating/object-rating-plan.js) uses simple multiplication to get the cost:
```javascript
((price, qty) => new BigNumber(qty).mul(price || 0).toNumber()).toString()
```

#### charge
A "reduce" function, responsible for charging at various levels: service instance, plan, app, space, org etc.
* input:
   * `t`: charges so far
   * `cost`: cost (from the `rate` function)
   * `from`:
   * `to`:
* output: charge

The [rating plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/rating/object-rating-plan.js) uses the cost as charge (does nothing):
```javascript
((t, cost, from, to) => cost ? cost : 0).toString()
````

### Formulas

Formulas are deprecated, under the hood they are converted to `meter` and `accumulate` Javascript functions.

### Existing metrics
### Metric Types
#### Discrete
#### Time-based

Abacus pipeline
---
Input
Output
Asynchronous

### Usage Submission
#### Formulas
#### Functions

### Plans
#### Metering
#### Rating
#### Pricing

### Usage reports
#### Time windows

How to submit a metric?
----

### Example clients
### Security
### Dealing with network issues
#### Batching requests
#### Retrying requests
#### Throttling requests


References
---
[1] Michell, J. (1999). Measurement in psychology: a critical history of a methodological concept. New York: Cambridge University Press.

[2] http://www.dictionary.com/browse/measure
