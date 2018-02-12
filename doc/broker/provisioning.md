# Abacus service boker provisioning API
## API overview
A provisioning plugin provides REST APIs for manipulation and retrieving information about provisioned resources in Abacus. For more details and examples, please have a look at the [resource provider guide](https://github.com/cloudfoundry-incubator/cf-abacus/blob/76dabd9ecc096ca8c8098eff0e2591ba2ed8f2f7/doc/resource-provider-guide.md#measure).

## Authentication

The requests MUST authenticate with the Abacus provisioning plugin via oAuth token (the `Authorization: ` header) on every request. The provisioning plugin is responsible for validating the oAuth token and returning a `401 Unauthorized` message if the token is invalid. oAuth token MUST include scopes. More information can be found in [Abacus Authentication-and-Authorization.](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Authentication-and-Authorization)

## Plans

### Create
`POST /v1/:plan_type/plans`

Create plan. The `:plan_type` MUST be one of the following types: `metering`, `rating`, `pricing`.

##### Body
| Request field | Type | Description |
| --- | --- | --- |
| plan | object | MUST be a [valid JSON object](#object-definitions) representing a plan. Plan id MUST be provided. In case of a resource specific token, plan id MUST ends with resource provider id. An example `metering`, `rating` and `pricing` [plans.](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Plans)  |

### Response
| Status Code | Description |
| --- | --- |
| 201 Created | Returned upon successful processing of this request. |
| 400 Bad Request | When plan id is missing. |
| 401 Unauthorized | When oAuth token is not valid. |
| 403 Forbidden | When no system write scope is provided or resource specific write scope is provided. |
| 409 Conflict | When the plan has a conflict. |

### Update
`PUT /v1/:plan_type/plans/:plan_id`

Update plan. The `:plan_type` MUST be one of the following types: `metering`, `rating`, `pricing`. The `plan_id` is a string and MUST be an existing plan id.

##### Body
| Request field | Type | Description |
| --- | --- | --- |
| plan | object | MUST be a [valid JSON object](#object-definitions) representing a plan. Plan id MUST be provided and MUST be the same as plan_id parameter in the route. In case of a resource specific token, plan id MUST ends with resource provider id. An example `metering`, `rating` and `pricing` [plans.](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Plans)  |

### Response
| Status Code | Description |
| --- | --- |
| 200 OK | Returned upon successful processing of this request. |
| 400 Bad Request | When plan id is missing or plan id from the mody does not match plan_id parameter in the route.|
| 401 Unauthorized | When oAuth token is not valid. |
| 403 Forbidden | When no system write scope is provided or resource specific write scope is provided. |
| 404 Not found | When the plan is not found. |

### Get
`GET /v1/:plan_type/plans/:plan_id`

Retrieve existing plan. The `:plan_type` MUST be one of the following types: `metering`, `rating`, `pricing`. The `plan_id` is a string and MUST be an existing plan id.

Pass `Cache-Control: no-cache` header to specify that the backend should not use caching. 

### Response
| Status Code | Description |
| --- | --- |
| 200 OK | Returned upon successful processing of this request. |
| 401 Unauthorized | When oAuth token is not valid. |
| 403 Forbidden | When no system read scope is provided or resource specific read scope is provided. |
| 404 Not found | When the plan is not found. |

#### Body
The body contains requested plan details. The structure of plan in the body is described below.

## Object definitions

### MeteringPlan
The metering plan defines the metering part of the calculations that Abacus will execute.

| Property | Type | Description |
| --- | --- | --- |
| plan_id | string |Plan ID |
| measures | array | Array of [Measures objects](#measure) |
| metrics | array | Array of [MeteringMetric objects](#meteringmetric) |

#### Measure
Measures are the raw data that you submit to Abacus. Each measure consists of multiple entries, each of them associated with a name and unit.

| Property | Type | Description |
| --- | --- | --- |
| name | string | The name of the measure. For example `storage`, `heavy_api_calls` or `light_api_calls`. |
| unit | string | The unit of the measure. For example `BYTE` and `CALL`. |

#### MeteringMetric
While the measures represent the raw data, the metrics combine and derive something out of the data.

| Property | Type | Description |
| --- | --- | --- |
| name | string | The name of the metric. For example `storage` or `thousand_light_api_calls`. |
| unit | string | The unit of the metric. For example `GIGABYTE` and `THOUSAND_CALLS`. |
| type | string | There are two metric types `discrete` and `time-based`. |
| meter | string | A map function responsible for transforming a raw measure into the unit used for metering. |
| accumulate | string |  A reduce function responsible for accumulating metered usage over time. |
| aggregate | string | A reduce function responsible for aggregating usage in Cloud Foundry entities (space and organization), instead of time. |
| summarize | string | A reduce function responsible for summarizing the different types of usage. |

### RatingPlan
A rating plan defines the rating calculations.

| Property | Type | Description |
| --- | --- | --- |
| plan_id | string | Plan ID |
| metrics | array | Array of [RatingMetric objects](#ratingmetric) |

#### RatingMetric
While the measures represent the raw data, the metrics combine and derive something out of the data.

| Property | Type | Description |
| --- | --- | --- |
| name | string | The name of the metric. For example `storage` or `thousand_light_api_calls`. |
| rate | string | A simple map function responsible for converting an aggregated usage into a cost. This can be done at various levels like service instance, plan, app, space, org etc. |
| charge | string | A reduce function responsible for charging at various levels like service instance, plan, app, space, org and so on. |

### PricingPlan
A pricing plan defines the pricing on per-measure basis.

| Property | Type | Description |
| --- | --- | --- |
| plan_id | string | Plan ID |
| metrics | array | Array of [PricingMetric objects](#pricingmetric) |

#### PricingMetric
While the measures represent the raw data, the metrics combine and derive something out of the data.

| Property | Type | Description |
| --- | --- | --- |
| name | string | The name of the metric. For example `storage` or `thousand_light_api_calls`. |
| metrics | array | Array of [Price objects](#price) |

#### Price
| Property | Type | Description |
| --- | --- | --- |
| country | string | The ID of the country. For example `EUR` or `USA`. |
| metrics | number | The price for the coresponding country. |


