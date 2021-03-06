Frequently Asked Questions (FAQ)
===

### How does the report generated by the demo relate to the submitted usage and rate data?

A resource provider controls how usage is metered, accumulated, aggregated, rated, summarized and charged through a set of Javascript functions (meter, accumulate, aggregate, rate, summarize, charge) that can be configured in a resource configuration JSON document.

These functions are called to process submitted usage as it flows through the Abacus meter, accumulator, aggregator and reporting services in the following sequence:

- the resource provider submits usage docs containing usage measures (e.g. number of API calls, or bytes of storage or memory);

- the resource provider's meter() function is called, given the usage measures, and is responsible for converting them to the metrics relevant for the particular resource (e.g. thousands of API calls, GB of storage, MB of memory);

- the provider's accumulate() function is called, responsible for accumulating (usually a simple sum) the particular metric over time (per sec, min, hour, day, month etc);

- the provider's aggregate() function is called next, responsible for aggregating (usually a sum as well) the particular metric at different levels under an organization;

- next, the provider's rate() function is called, responsible for computing the cost of the metric given the usage and the price of the particular metric;

- finally the summarize() and charge() functions are called to compute the final usage summary and corresponding charges, at the time the usage summary report gets produced.

On a final note, usage measures and metrics can be expressed as simple numbers (e.g. a decimal number representing a number of API calls) or compound data structures for more sophisticated usage metering schemes (e.g the ability to represent something like 'already consumed 153GB of memory and now consuming 3GB since 9:32am today'); the provider's meter, accumulate, aggregate etc functions are then free to interpret the data structure representing the metric however they want.
  
### How to get Usage Data from CF?

We have a prototype for reporting Cloud Foundry app and service runtime usage data to Abacus. You can have a look at the CF application bridge [source](../lib/cf/applications) and CF services bridge [source](../lib/cf/services).

What we currently do for applications is to:
- obtain an oauth token from CF
- list app usage events
- report linux-container metrics   

For services we do:
- obtain an oauth token from CF
- list service usage events
- report linux-container metrics   

For now we basically report the memory used and the number of service instances.

### Is there an API to cancel or correct entries?

Our current strategy is to have the service or runtime provider submit compensating usage (e.g. if that service provider thinks it has submitted too much GB hours for example, he can always compensate that with a negative/credit usage later). If there's a mistake, it's compensated later, we don't rewrite history, for many reasons including auditing, potentially legal reasons etc...

The other thing to consider is that even if there was a way to rewrite history, that wouldn't handle the cases where the mistaken usage would have already been shown to the customer (as customers are typically able to see their usage in close to real time) or, even more difficult... the cases where that usage would have already been billed to that customer (e.g. the mistake happened on 08/31 23:30pm and only got discovered on 09/01 after a bill was produced and sent to the customer...)

### Can one configure CF-Abacus for a trial period?

Abacus allows you to completely control how usage and costs are accumulated over time, and aggregated at various levels inside an organization using Javascript functions that you can define yourself for each resource, so yes you should be able to implement that kind of logic.

We are actually in the middle of implementing time windows (sec, min, hour, day, month, year) for usage accumulation so when that's in place it'll be even easier to do it.

Another thing to consider is that Abacus doesn't do billing/invoicing. We meter, aggregate and rate usage to produce usage and charge summary reports that can then be fed to a billing system. Your particular billing system can eventually decide to apply discounts or 'just make it free for that customer' for example on top of the usage and rating data that Abacus provided.

### Can we set different prices for different customers?

The pricing is currently loaded from a simple JSON configuration file, but the intent is to convert that to a service that an integrator of Abacus can implement to control what price is used for a particular resource, plan, organization, time (as prices evolve over time), country, currency etc.
  
That service will need to implement a REST API that Abacus will call to get the price to use to rate the usage. So, yes, with that you'll be able to return a different pricing per customer (i.e. per organization).

