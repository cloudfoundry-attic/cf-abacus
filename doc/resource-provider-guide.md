# Resource Provider Guide

## Abacus Overview
Abacus provides usage metering and aggregation for [Cloud Foundry (CF)](https://www.cloudfoundry.org) services. It is implemented as a set of REST micro-services, which collect usage data, apply metering formulas, and aggregate usage at several levels within a Cloud Foundry organization.

Abacus provides a REST API allowing cloud service providers to submit usage data, and a REST API allowing usage dashboards, and billing systems to retrieve usage reports. The Abacus REST API is described in [doc/api.md](doc/api.md).

## Roles
The roles used in this guide are listed below:

### Cloud Foundry Operator

The Cloud Foundry Operator is responsible for the day-to-day operation of Cloud Foundry. The responsibilities of the operator include, but are not limited to:
* Create/modify resources (organizations, spaces, quotas, services) needed for Abacus or the Resource providers
* Scale Cloud Foundry installation to fit usage requirements
* Update parts of the Cloud Foundry landscape:
    * Buildpacks (new runtimes)
    * Stemcells (OS or security fixes)
    * Infrastructure services (Diego, ELK)
    * Marketplace services

The operator's responsibilities are often shared between several teams, organizations and even companies. For example you might have:
* CloudOps (Amazon, Google Cloud, Azure, OpenStack operation)
* Cloud Foundry operators (CF operation)
* DevOps teams (operating infra and user-facing services)

### User

User is the customer who uses software (SaaS), applications (PaaS) or resources (IaaS) from the Cloud Foundry system. The user is charged for the consumed resources.

### Abacus Integrator

The Abacus Integrator is responsible for the correct functioning of the Abacus components. The integrator is also responsible for the integration and functioning of the Abacus pipeline with Cloud Foundry. The integrator is responsible for requesting (from the CF operators), monitoring and provisioning the needed memory, network and database resources for Abacus.
The integrator also takes care of any integrations with services you can deploy along with Abacus, such as monitoring, logging, auditing, BPEM processes, billing system and usage analytics.

### Resource Provider

The Resource Provider is responsible for providing resources to the users. To meter the resource usage, each Resource Provider must submit usage documents to Abacus.

### Report Consumer

The Report Consumer can request a usage report from Abacus. This report can be presented directly to the User or used to feed external systems like monitoring or billing.

The following diagram shows the Resource Provider and Resource Consumer roles:

![Resource Provider diagram](provider-consumer.png)


# Abacus Pipeline Concepts
Abacus is a distributed system built with micro-services. It accepts as input usage events, processes them and generates reports and summaries upon request.
![Resource Provider diagram](pipeline.png)

Resource providers are responsible to generate the usage events/documents and to submit them to Abacus. Each usage document contains one or more **measures**.

## Measure
**Measure** can be defined as "the determination or estimation of ratios of quantities" [1] or "the extent, dimensions, quantity, etc., of something, ascertained especially by comparison with a standard" [2]

Measures are the raw data that you submit to Abacus. Each measure consists of multiple entries, each of them associated with a name and unit.

Abacus project has an [object store example](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-object-storage.js). Inside, you can find several measures:
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

We can submit to Abacus a measure that has 10 storage units (bytes) and 5 light API calls.

## Metric
While the measures represent the raw data, the metrics combine and derive something out of the data.

As already said the raw data is submitted to Abacus so it can meter and aggregate the measures into metrics.

In the [object store example](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-object-storage.js) there are several metrics:
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

The metrics above first convert the measures to gigabytes and thousands of calls, and then combines them to derive a quantifiable value.

The metrics can produce simple numbers or compound data structures if they need to keep state, or to perform some complex processing.

### Functions
To combine the measures into metrics a Resource Provider can define six JavaScript functions: `meter`, `accumulate`, `aggregate`, `rate`, `summarize` and `charge`.

The Abacus processing pipeline is a simple composition that can be expressed as follows:

`charge(…, summarize(…, rate(aggregate(..., accumulate(..., meter(usage)))))))`

The functions usually work with [BigNumber.js](https://github.com/MikeMcl/bignumber.js) to allow higher precision of the result.

#### meter
   A "map" function, responsible for transforming a raw measure into the unit used for metering.
   * input arguments:
      * `m`: submitted measure
   * return value: metered measure

   In our example, we want to meter thousands of API calls so our meter function will map the measure `x` to `x / 1000`:
   ```javascript
    (m) => new BigNumber(m.storage).div(1073741824).toNumber()).toString()
   ```

The function often performs rounding or similar operations as well.

#### accumulate
A "reduce" function responsible for accumulating metered usage over time.
* input arguments:
   * `a`: accumulated result so far
   * `qty`: current measure
   * `start`: start time of the resource usage
   * `end`: end time of the resource usage
   * `from`: the last time at which the resource instance usage was accumulated. `undefined` if there is no previous accumulated usage for the resource instance by a specific consumer
   * `to`: the time to which the resource instance usage must be accumulated
   * `twCell`: time-window cell
* return value: new accumulated result

A typical use is a sum of all metered usage for a resource instance over time.

The function is often implemented as a maximum value over the given period of time. For example, the object store finds the max memory used by the storage:
```javascript
((a, qty, start, end, from, to, twCell) => end < from || end >= to ? null : Math.max(a, qty)).toString()
```

#### aggregate
"reduce" function responsible for aggregating usage in Cloud Foundry entities (space and organization), instead of time.
* input arguments:
   * `a`: aggregateed result so far. `undefined` if no usage
   * `prev`: previous aggregateed result
   * `curr`: current measure. `undefined` if usage was rejected by accumulate
   * `aggTwCell`: aggregation time-window cell
   * `accuTwCell`: accumulation time-window cell
* return value: new aggregated result

Usually used to add up usage from:
* different service instances under a service
* all the service instances under a space/app/org and so on

In most of the cases, the function sums up the measures as shown in our object store example:
```javascript
((a, prev, curr, aggTwCell, accTwCell) => new BigNumber(a || 0).add(curr).sub(prev).toNumber()).toString()
```

#### rate
A simple 'map' function responsible for converting an aggregated usage into a cost. This can be done at various levels: service instance, plan, app, space, org etc.
* input arguments:
   * `price`: price of the usage
   * `qty`: aggregated usage quantity
* return value: cost

A typical rate function will just multiply the metered usage by a price to get the cost, but youw can also use more sophisticated rate functions for clip levels, pro-rating and other.

The [object store rating plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/rating/object-rating-plan.js) uses simple multiplication to get the cost:
```javascript
((price, qty) => new BigNumber(qty).mul(price || 0).toNumber()).toString()
```

#### summarize
A "reduce" function responsible for summarizing the different types of usage.
* input arguments:
   * `t`: summary so far
   * `qty`: `undefined` if no usage
   * `from`: the last time at which the resource instance usage was summarized. `undefined` if there is no previous summary for the resource instance by a specific consumer
   * `to`: the time to which the resource instance usage must be summarized
* return value: summarized usage

#### charge
A "reduce" function responsible for charging at various levels: service instance, plan, app, space, org and so on.
* input arguments:
   * `t`: charges so far
   * `cost`: cost (from the `rate` function)
   * `from`: the last time at which the resource instance usage was charged. `undefined` if there is no previous charge for the resource instance by a specific consumer
   * `to`: the time to which the resource instance usage must be charged
* return value: charge

The [rating plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/rating/object-rating-plan.js) uses the cost as charge (does nothing):
```javascript
((t, cost, from, to) => cost ? cost : 0).toString()
````

### Formulas
Formulas are deprecated. Under the hood they are converted to `meter` and `accumulate` JavaScript functions.

## Plan
Measures and metrics are grouped into single entity - the plan. Plans provide Recourse Providers with a way to express the relationship between the measures and metrics. If for example, you need two measures to be able to calculate the value of a metric you can group the two measures and the metric into a metering plan.

Based on what the plan does, there are 3 plan categories: metering, rating or pricing.

### Metering Plan
The metering plan defines the metering part of the calculations that Abacus will execute. You can use the `meter`, `accumulate` and `aggregate` functions with a metering plan. Examine the [object storage metering plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-object-storage.js).

### Rating Plan
A rating plan defines the rating calculations. You can use the `charge` and `rate` functions with a metering plan. You can check our [example rating plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/rating/object-rating-plan.js).

### Pricing Plan
A pricing plan defines the pricing on per-measure basis. Have a look at our example [pricing plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/pricing/object-pricing-standard.js) for more details on the exact format.

## Sample Plans
There are a few predefined plans available in Abacus and you can check them out as examples.

You can find the list of the plans and the metrics contained in Abacus below:
* [object storage](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-object-storage.js#L23)
   * storage space
   * number of API calls
* [basic analytics](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-analytics.js)
   * average number of instances
   * number of API calls
* [linux container](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-linux-container.js)
   * memory usage [GB/h]

For more information about the object storage metrics, refer to the examples in this guide.

The analytics metrics use deprecated formulas and you can use them as a reference on how to migrate from the formulas to the new functions format.

## Metric Types
There are two metric types in Abacus:
* **"discrete"**, also known as stateless, "historical" and "log-like"
* **"time-based"**, also known as stateful

Let's see what characterizes the two metric types in Abacus.

### Discrete
These metrics are stateless. They resemble message logs, since you simply submit them to Abacus. When you request an aggregated result from Abacus, it goes through the history of events and performs calculations, based on the defined formulas.

The object store plan is the typical use-case for discrete metrics. You submit the amount of storage used in the store in a log-like historical manner. Abacus then calculates the total amount spent.

The discrete metrics are usually quite simple and deal with simple numbers in both measures and metrics.

### Time-Based
The time-based metrics are stateful. You store the state of the resource instance and use it to calculate the result on request.

The linux-container plan contains the gigabytes **per hour**. The usage is ongoing and grows over time.

It is important to note that time-based metrics often use compound data structures to keep track of the usage. For example, you submit the previous and the current measures of the container resource to calculate the GB/h usage.

#### Sample
The [example time-based plan](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/plans/metering/basic-linux-container.js) measures memory consumption over time.

To start application A with an instance of 1 GB we can submit these measures:
```
current_running_instances: 1,
current_instance_memory: 1073741824,
previous_running_instances: 0,
previous_instance_memory: 0
```

To update A with 1 instance of 1 GB to 2 instances of 2 GB we submit measures:
```
current_running_instances: 2,
current_instance_memory: 2147483648,
previous_running_instances: 1,
previous_instance_memory: 1073741824
```

To stop A:
```
current_running_instances: 0,
current_instance_memory: 0,
previous_running_instances: 2,
previous_instance_memory: 2147483648
```

The algorithm works like this:
* When the app had consumed memory in the past before it was stopped (or will consume in the future after it is started), it would add negative consumption
* When the app had not consumed memory in the past before it was started (or will not consume in the future after it is stopped), it would add positive consumption

The plan works with out-of-order data submission and guarantees correctness, given there is no missing usage submission. This basically means that the previous usage has to be submitted together with the current one.

Furthermore it works only within the time-window, meaning that the calculated numbers would be wrong if:
* The usage is for the period outside of `from` (start of the month) and `to` (end of the month)
* The earliest event usage submitted for that time period ('from' -> 'to') is not a start (with previous values set to 0)

Internally, the metrics use a compound data structure consisting of:
* `consuming`: the latest GB (event time)
* `consumed`: the "memory balance" that the app has consumed. The number is relative to the time boundary as described above.

*Example 1:*

Let's go through the formula with a simple example:

1. If the time period is from the 1st to the 30th of a given month, we have `start=1` and `end=30`
2. An app starts consuming 1 GB on the 20th of the given month.
3. `consumed` will be the amount that the app is not consuming (from the start of the month till 20th).
4. From the 20th till the end of the month the app will consume `= 20 - 10 * direction(+1) = 10`

Let's grab a report on the 30th. Then `consumed` will be `the amount that the app has been consuming (start of the month till the 30th) + the amount that the app would be idle * direction(-1) / 2 = (10 - 30 + 0) * -1 / 2 = 10.`

*Example 2:*

If there is a stop event on the 25th: `consuming = 0`, then `consumed` will be: `the previous consumed - the amount that the app has been consuming (start -> 25th) + the amount that the app would be idle (25th -> end) = 10 - 25 + 5 = -10 * direction(-1) = 10`

If we grab a report on the 30th, since `consuming` is 0, we will calculate `consumed` as (10) / 2 = 5.

*Example 3:*

Let's use a real example of a submission:

1. An hour window `from: 1467280800000 (Thu Jun 30 2016 03:00:00 GMT-0700 (PDT))` and `to: 1467284400000 (Thu Jun 30 2016 04:00:00 GMT-0700 (PDT))`
2. `event time: 1467283200000 (Thu Jun 30 2016 03:40:00 GMT-0700 (PDT))`
3. `consuming = 1 GB`
4. We grab the report at the end of the time window (to)
5. The app has been consuming 1 GB for 20 minutes: `1 GB * 20 minutes / 1 hour = 0.33333 GB/h`

The result of this submission in the pipeline would be:

1. `consuming = 1`
2. `consumed = 1 * ((1467280800000 - 1467283200000) + (1467284400000 - 1467283200000)) = -1200000`
3. `since: 1467283200000` (used to keep track of the most up-to-date consuming)

The `consumed` would be negative because this is relative to the `from` and `to` window. If the event time is > 1/2 of the window, it will results in a negative number.This is fine, because when on report generation, the `summarize` function would make sense of the number.

If we get a summary at the end of the window `to: 1467284400000 (Thu Jun 30 2016 04:00:00 GMT-0700 (PDT))`, we will get:

1. `consumed = current consuming * -1 * ((1467280800000 - 1467284400000) + (1467284400000 - 1467284400000)) = 3600000`
2. `summary = (current consumed + consumed) / 2 / 3600000 = (-1200000 + 3600000) / 2 / 3600000 = 0.33 GB/h`

That's exactly the amount the instance has consumed in the window: `20 / 60 = 0.33333 GB/h`

#### Carry-over

The time-based usage metrics are carried over into each new monthly database partition by the [cf-renewer](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/cf/renewer) app. It transfers the active resource consumption from the previous month into the current one.

**Warning:**
The cf-renewer app supports only plans with "pure" time-based metrics. This means that any usage documents with a metering plan that has both discrete and time-based metrics will be ignored !

## Time windows
A time window is defined as a range of time covering the boundaries of a specific time to a specific time dimension. For example, `[2015-01-01T00:30:00.000Z, 2015-01-01T00:31:00.000Z]` would be a time window of January 1, 2015 at 12:30 A.M.

Abacus uses time-windows in its report data to provide the clients with info about the usage in several dimensions. These time-windows use UTC time with the dimensions of a second, minute, hour, day, and month.

The windows structure is an array of arrays. The outer array is always five elements that stand for the dimensions for which the usage would be accumulated.

The inner array of each of these dimensions is in the format of
```
[
  current time in the dimension unit,
  current time in the dimension unit - 1 dimension unit,
  ...,
  current time in the dimension unit - N dimension units
]
```

If the windows was pulled from January 31st we have an object that looks like this:
```json
[
  [31],
  [1, 1, 1, 1, 1],
  [null],
  [null],
  [null],
]
```

A conceptual representation as a JSON of the above object may look like:
```json
{
  "Month": {
    "0": 31
  },
  "Day": {
    "0": 1,
    "-1": 1,
    "-2": 1,
    "-3": 1,
    "-4": 1
  },
  "Hour": {},
  "Minute": {},
  "Second": {}
}
```

*Note:* the structure above does not exist, it is used to make things easier to explain. Abacus provides a few helpful functions in the [timewindow module](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/timewindow).

In the month dimension, we have a quantity of 31 for the whole month of January. In the day usage, we have a quantity of 1 for the day of January 31st, 30th, 29th, 28th, and 27th. A null means that there is no quantity in that particular time.

The purpose for keeping track of the previous days is to allow a submission of usage up to several days late. When usage is retrieved, it has a processed time in milliseconds. Those previous indices are saying "I know of all this usage at the processed time". If Abacus allows submission up to 5 days late, the date when you can get the most up-to-date data for the whole month of January is February 4th.


**Example:** Charting usage

If our x-axis is the time dimension, we may want to consider to what granularity we want to show our data. Is it quantity over an entire month? If so, we would want to use the values from the month dimension. Same for any other dimensions.

If we want to chart the monthly quantity of a particular resource that submits every 4 hours. Given that we have roughly 6 submissions a day, and there’s 31 days in July, that makes around 186 submissions for the month of July for this example.

We'll get events like:
```javascript
{
  ...
  "processed": 1467331200000,
  "windows": [[1], [null], [null], [null], [null]]
  ...
}
```
We can chart the processed time as the x-axis, and the y-axis would take the current month value.

If we assume that with each submission, the quantity for the month is incremented by 1, this would give a linear chart of 186 points where:
* the 1st point has an x-axis of value 1467331200000 and y-axis of value 1
* the last point has an x-axis value of 1470009600000 and y-axis value of 186

## Slack window

As discussed in the time-window section the pipeline can reject usage older than a predefined amount of time. The time interval that allows submission of late usage is called Slack Window.

Abacus Integrator can configure the the exact value of the slack window.

# How to submit a usage?

To submit usage document use the [insert method](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md#method-insert) described in the API doc with the URL of the Abacus usage collector.

The collector is usually accessed via `https://abacus-usage-collector.<cf-domain>`. Contact your Abacus Integrator to obtain the exact URL.

## Security
Abacus can work in secured and non-secured modes. Please contact your Abacus integrator to check if Abacus is secured.

Secured Abacus would require [resource token](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/security.md#resource-tokens) for the submission of every usage document. We can obtain the token from [token issuer](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/security.md#token-issuer).

*Note:* Abacus provides the [oauth module](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/oauth) to help you obtain the needed token. For more information about how to use it, see the [Demo client](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/client/src/test/test.js) example.

## Examples
Abacus provides several examples on how to submit usage:
* [Post usage](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/client/src/test/post.js)

   Submits usage to non-secured Abacus.

* [Demo client](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/client/src/test/test.js)

   Simulates a Service Provider and Report Consumer. Submits usage and verifies the submission by retrieving a usage report. Works with secured Abacus.

We can run Post example with:
```bash
cd ~/workspace/cf-abacus
npm restart
cd node_modules/abacus-demo-client && node src/test/report.js
```

To run the demo client:
```bash
cd ~/workspace/cf-abacus
npm restart
npm run demo
```

## Creating a Resource Provider

To create a resource provider you need to define the following Abacus entities:
* [measures](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/resource-provider-guide.md#measure)
* [metrics](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/resource-provider-guide.md#metric)
* [plans](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/resource-provider-guide.md#plan)

We should start with the measures, then define the metrics and finally decide on what type of plans to use. Once all of the above is defined we can create a plan. 

Abacus provides an example implementations of the [provisioning](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/plugins/provisioning) and [account](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/plugins/account) plugins for demo and test purposes. Abacus Integrators must replace this implementations with custom code to satisfy the requirements, processes and product standards in your organization. 

Check with your [Abacus Integrator](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/resource-provider-guide.md#abacus-integrator) on how to create a plan. 

If you want to experiment with the example provisioning and account plugins for local development follow these steps: 
* add the plan files under [plans directory](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/plugins/provisioning/src/plans)
* change the [plan mappings](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/config/mappings/src/plans)

The example provisioning plugin will return `404` with `"x-app-name":"abacus-provisioning-plugin"` in case it cannot find a plan by `resource_type` and provisioning `plan_id`:
```
{
  "message": {
    "statusCode": 404,
    "headers": {
      ... headers ...
      "x-app-name": "abacus-provisioning-plugin",
      ... more headers ...
    }
  },
  "statusCode": 404,
  "headers": {
    ... headers ...
    "x-app-name": "abacus-provisioning-plugin",
    ... more headers ...
  }
}
```

Please check the [network issues](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/resource-provider-guide.md#dealing-with-network-issues) section for hints on how to implement the network connectivity to Abacus.

# Usage reports
Using get methods we can obtain:
* [summary usage report](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md#usage-summary-report)
* [resource instance report](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md#resource-instance-usage-summary-report)
* [aggregated usage](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md#graphql-usage-query)

All reports are requested from Abacus Usage Reporting micro-service, with a URL in the following format `https://abacus-usage-reporting.<cf domain>`. Contact your Abacus Integrator for the exact URL.

## GraphQL
[GraphQL](https://github.com/facebook/graphql) is a query language used by Abacus to allow users to navigate and query the graph of aggregated usage.

There are [several examples](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md#graphql-usage-query) in the [API doc](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/api.md) of Abacus on how to use GraphQL. [GraphiQL IDE](https://github.com/graphql/graphiql) can help when designing new queries.

## Examples
Abacus provides several examples on how to submit usage:
* [Usage report](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/client/src/test/report.js)

   Obtains summary usage report for an organization.

* [GraphQL](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/client/src/test/post.js)

   Submits usage to a non-secured Abacus.

* [Demo client](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/demo/client/src/test/test.js)

   Simulates a Service Provider and a Report Consumer. Submits usage and verifies the submission by retrieving a usage report. Works with secured Abacus.

Run the report example with:
```bash
cd ~/workspace/cf-abacus
npm restart
cd node_modules/abacus-demo-client && node src/test/report.js
```


We can run GraphQL example with:
```bash
cd ~/workspace/cf-abacus
npm restart
cd node_modules/abacus-demo-client && node src/test/graphql.js
```

To run the demo client:
```bash
cd ~/workspace/cf-abacus
npm restart
npm run demo
```

# Dealing with network issues
Submitting usage document or getting usage report involves network operations. As with every network, failure is inevitable and the Resource Provider need to take care of all network issues.

In this section we will present several ways to deal with unreliable network (circuit breaker, retry) and bandwidth and latency problems (batching, throttling).

## Retrying requests
Retrying a failed request is the easiest way to deal with network problems.

It is mandatory for Resource Providers to implement retry since reporting usage might rather fail than succeed due to a number of reasons (including but not limited to network and hardware issues, Abacus problems, CloudOps & DevOps updates).

Retrying a report puts some requirements on the Resource Providers. They need to persistently store the usage that was not successfully reported to guarantee that it is not lost.

Of course not all of the requests can be retried. For example, response 409/Conflict in most cases means:
* we already submitted that usage
* we are trying to submit usage outside of the slack window

Another example, where we cannot simply retry, is the 404 error code. It usually means that Abacus does not know about certain entity and retrying won't help to resolve the issue.

Abacus has the [retry module](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/retry) that can help us with the retry task.

## Circuit breakers
Making a Resource Provider resilient requires you to isolate parts of your Resource Provider, to isolate from failing Abacus installation or to simply avoid failure cascades in a graph of function calls.

You can do that with the help of the [breaker module](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/breaker). Java-based Resource providers can use the [Hystrix library](https://github.com/Netflix/Hystrix)

Abacus itself provides hystrix compatible streams for all its micro-services built with the help of [perf](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/perf) and [hystrix](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/hystrix) modules.

## Batching requests
If you are submitting a lot of usage documents, you can make use of the [batch module](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/batch) that will wrap all requests into a batch (very similar to the way DBs use batching).

This technique allows you to reduce the bandwidth and the latency, compared to using hundreds or thousands of single usage requests.

## Throttling requests
Even with batching, the number of requests is not limited and it can grow beyond the capabilities of the physical machine. This, in turn, results in network failures or VM/engine errors and crashes, depending on the used stack.

You can use connection pools, a dedicated client (that basically does the pooling) or with Node.js you can use the [throttle module](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/throttle).

## Chaining modules

Abacus modules can be chained. For example to get a request that is throttled, retries, has breaker and batches, simply use:
```javascript
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const throttle = require('abacus-throttle');
const request = require('abacus-request');

const reliableRequest = throttle(retry(breaker(batch(request))));
````

# References
[1] Michell, J. (1999). Measurement in psychology: a critical history of a methodological concept. New York: Cambridge University Press.

[2] http://www.dictionary.com/browse/measure
