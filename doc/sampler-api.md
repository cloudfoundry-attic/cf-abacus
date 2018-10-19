Abacus Sampler API
=======

## Abstract

Abacus Sampler provide an easy to use REST API which can be used by clients to measure long-running consumptions.

## REST API

## Start Endpoint

The start endpoint can be used to publish start events, marking the beginning of a continuous measure.

```
POST https://abacus-usage-sampler.cf.sap.hana.ondemand.com/v1/events/start
```

*authentication:* Require valid oAuth 2.0 token with `abacus.sampler.write` scope. 

*request body:*

```json
{
  "id": "e2e23a2a-357c-4bea-a451-ce1dfe1e73aa",
  "timestamp": 1533197794000,
  "organization_id": "43a8d88a-3ae8-47a8-a82f-f5dd336b1b4c",
  "space_id": "78f79e6a-566c-40bd-aed4-ba129d4b858e",
  "consumer_id": "a1e7d724-b6a8-4efd-bcac-2ee03bf61a72",
  "resource_id": "3949b30a-9c89-4897-9f4e-5b0afe812ecf",
  "plan_id": "11a62b4b-9bb6-4c0a-b252-3d8cb98f9880",
  "resource_instance_id": "982c6024-4f5c-48e8-a64b-cf72d30df7dc",
  "measured_usage": [
    {
      "measure": "memory",
      "quantity": 512
    }
  ]
}
```

## Parameters 

| Name       | Description |
| ------------- |:-------------|
| id | Document unique identifier. |
| timestamp | Document moment of occurrence. (UNIX epoch time in milliseconds) |
| organization_id | Organization GUID of the consuming organization. |
| space_id | Space GUID of the consuming application.  |
| consumer_id | Identifier of the resource consumer. |
| resource_id | Service offering name. |
| plan_id | Service offering plan name. |
| resource_instance_id | Service instance GUID. |
| measured_usage | Array of measure and quantity pairs. |


## Response Codes 

| Code       | Description |
| ------------- |:-------------|
| 201 | Document successfully processed. |
| 400 | Invalid request due to wrong document schema. |
| 409 | Dupplicate document. |
| 415 | Wrong request content type. |
| 422 | Document out of slack period. |
| 500 | Internal server error. |


## Stop Endpoint

The stop endpoint can be used to publish stop events, marking the end of a continuous measure.

```
POST https://abacus-usage-sampler.cf.sap.hana.ondemand.com/v1/events/stop
```

*authentication:* Require valid oAuth 2.0 token with `abacus.sampler.write` scope. 

*request body:*

```json
{
  "id": "dead0f92-7c38-4d05-b019-1a53e9e60af7",
  "timestamp": 1533197794000,
  "organization_id": "43a8d88a-3ae8-47a8-a82f-f5dd336b1b4c",
  "space_id": "78f79e6a-566c-40bd-aed4-ba129d4b858e",
  "consumer_id": "a1e7d724-b6a8-4efd-bcac-2ee03bf61a72",
  "resource_id": "3949b30a-9c89-4897-9f4e-5b0afe812ecf",
  "plan_id": "11a62b4b-9bb6-4c0a-b252-3d8cb98f9880",
  "resource_instance_id": "982c6024-4f5c-48e8-a64b-cf72d30df7dc"
}
```

## Parameters 

| Name       | Description |
| ------------- |:-------------|
| id | Document unique identifier. |
| timestamp | Document moment of occurrence. (UNIX epoch time in milliseconds) |
| organization_id | Organization GUID of the consuming organization. |
| space_id | Space GUID of the consuming application.  |
| consumer_id | Identifier of the resource consumer. |
| resource_id | Service offering name. |
| plan_id | Service offering plan name. |
| resource_instance_id | Service instance GUID. |

## Response Codes 

| Code       | Description |
| ------------- |:-------------|
| 201 | Document successfully processed. |
| 400 | Invalid request due to wrong document schema. |
| 409 | Dupplicate document. |
| 415 | Wrong request content type. |
| 422 | Unprocessable event. |
| 500 | Internal server error. |


## Mapping Endpoint

The mapping endpoint can be used to map service name and plan to relevant metering, rating and pricing plans. 

```
POST https://abacus-usage-sampler.cf.sap.hana.ondemand.com/v1/events/stop
```

*authentication:* Require valid oAuth 2.0 token with `abacus.sampler.write` scope. 

*request body:*

```json
{
  "resource_id": "3949b30a-9c89-4897-9f4e-5b0afe812ecf",
  "plan_id": "11a62b4b-9bb6-4c0a-b252-3d8cb98f9880",
  "metering_plan": "982c6024-4f5c-48e8-a64b-cf72d30df2dc",
  "rating_plan": "345c6024-4f5c-48e8-a64b-cf34d67df7dc",
  "pricing_plan": "123c6024-4f5c-48e8-a64b-cf34f30df5dc"
}
```

## Parameters 

| Name       | Description |
| ------------- |:-------------|
| resource_id | Service offering name. |
| plan_id | Service offering plan name. |
| metering_plan | Metering plan identifier. |
| rating_plan | Rating plan identifier. |
| pricing_plan | Pricing plan identifier. |

## Response Codes 

| Code       | Description |
| ------------- |:-------------|
| 201 | Document successfully processed. |
| 400 | Invalid request due to wrong document schema. |
| 409 | Returned only in case all of the mappings (metering, pricing and rating) have been already created. If one of the mappings returns 200 or 500 it is propagated to the client. |
| 415 | Wrong request content type. |
| 500 | Internal server error. |
