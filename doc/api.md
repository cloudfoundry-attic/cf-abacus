Abacus Metering and Aggregation REST API
===

The Abacus Usage Metering and Aggregation REST API can be used by Cloud resource providers to submit usage data, usage dashboards to retrieve real time usage reports, and billing systems to retrieve the aggregated and rated usage data needed for billing. Cloud resources include services and application runtimes or containers for example.

Usage data is exchanged with Abacus in the form of usage documents. Each document type has a JSON representation and one or more REST methods.

Document types
---

Resource usage collection

Resource configuration

Resource pricing

Usage summary report

GraphQL usage query

Resource usage
---

The _resource usage collection_ API can be used by Cloud resource providers to submit usage for instances of Cloud resources, including service instances and application runtimes or containers.

Usage can be submitted by POSTing _resource usage_ documents to Abacus.

A _resource usage document_ contains usage measurements for a Cloud resource.

Once a _resource usage_ document has been submitted to Abacus it can be retrieved using GET.

### Method: insert
_HTTP request_:
```
POST /v1/metering/collected/usage with a resource usage document
```

_Description_: Records the _resource usage_ document and processes the Cloud resource usage data it contains.

_HTTP response_: 201 to indicate success with the URL of the _resource usage_ document in a Location header, 400 to report an invalid request, 500 to report a server error.

### Method: get
_HTTP request_:
```
GET /v1/metering/collected/usage/:usage_document_id
```

_Description_: Retrieves a previously submitted _resource usage_ document.

_HTTP response_: 200 to indicate success with the requested _resource usage_ document, 404 if the usage is not found, 500 to report a server error.

### JSON representation:
```json
{
  "start": 1396421450000,
  "end": 1396421451000,
  "organization_id": "us-south:54257f98-83f0-4eca-ae04-9ea35277a538",
  "space_id": "d98b5916-3c77-44b9-ac12-04456df23eae",
  "consumer_id": "app:d98b5916-3c77-44b9-ac12-045678edabae",
  "resource_id": "object-storage",
  "plan_id": "basic",
  "resource_instance_id": "d98b5916-3c77-44b9-ac12-04d61c7a4eae",
  "measured_usage": [
    {
      "measure": "storage",
      "quantity": 10
    },
    {
      "measure": "api_calls",
      "quantity": 10
    }
  ]
}
```

### JSON schema:
```json
{
  "type": "object",
  "required": [
    "usage"
  ],
  "properties": {
    "start": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "end": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "organization_id": {
      "type": "string"
    },
    "space_id": {
      "type": "string"
    },
    "consumer_id": {
      "type": "string"
    },
    "resource_id": {
      "type": "string"
    },
    "plan_id": {
      "type": "string"
    },
    "resource_instance_id": {
      "type": "string"
    },
    "measured_usage": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "measure",
          "quantity"
        ],
        "properties": {
          "measure": {
            "type": "string"
          },
          "quantity": {
            "type": "number"
          }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties": false,
  "title": "Resource Usage"
}
```
Resource type
---
The _resource type_ API is used by abacus to retrieve _resource type_ for Cloud resources.

This API enable Cloud platform integrating Abacus to generalizes onboarded resource_ids to a single resource type.

### Method: get
_HTTP request_:
```
GET /v1/provisioning/resources/:resource_id/type
```
_Description_: Retrieves the resource type for the specified resource id.

_HTTP response_: 200 to indicate success with the requested _resource type_, 404 if the resource type is not found, 500 to report a server error.

Metering plan id
---
The _metering plan id_ API is used by abacus to retrieve _metering plan id_ for Cloud resources.

Given the organization id, resource type, plan id, and time returns the metering plan id.

This API gives more flexibility to Cloud platform integrating Abacus. Cloud platform integrating Abacus would be able give different way of metering depending on the given organization id, resource type, plan id, and time. 

### Method: get
_HTTP request_:
```
GET /v1/metering/organizations/:organization_id/resource_types/:resource_type/plans/:plan_id/time/:time/metering_plan/id
```
_Description_: Retrieves the metering plan of the specified organization id, resource type, plan id at the specified time.

_HTTP response_: 200 to indicate success with the requested _metering plan id_, 404 if the metering plan id is not found, 500 to report a server error.

Rating plan id
---
The _rating plan id_ API is used by abacus to retrieve _rating plan id_ for Cloud resources.

Given the organization id, resource type, plan id, and time returns the rating plan id.

This API gives more flexibility to Cloud platform integrating Abacus. Cloud platform integrating Abacus would be able give different way of rating depending on the given organization id, resource type, plan id, and time. 

### Method: get
_HTTP request_:
```
GET /v1/rating/organizations/:organization_id/resource_types/:resource_type/plans/:plan_id/time/:time/rating_plan/id
```
_Description_: Retrieves the rating plan of the specified organization id, resource type, plan id at the specified time.

_HTTP response_: 200 to indicate success with the requested _rating plan id_, 404 if the rating plan id is not found, 500 to report a server error.

Pricing plan id
---
The _pricing plan id_ API is used by abacus to retrieve _pricing plan id_ for Cloud resources.

Given the organization id, resource type, plan id, and time returns the pricing plan id.

This API gives more flexibility to Cloud platform integrating Abacus. Cloud platform integrating Abacus would be able give different pricing depending on the given organization id, resource type, plan id, and time. 

### Method: get
_HTTP request_:
```
GET /v1/pricing/organizations/:organization_id/resource_types/:resource_type/plans/:plan_id/time/:time/pricing_plan/id
```
_Description_: Retrieves the pricing plan of the specified organization id, resource type, plan id at the specified time.

_HTTP response_: 200 to indicate success with the requested _pricing plan id_, 404 if the pricing plan id is not found, 500 to report a server error.

Metering plans
---

The _metering plans_ API is used by Abacus to retrieve _metering plan_ documents for Cloud resources.

_Metering plan_ documents describe the types of measurements, metrics, units, and metering, accumulation, aggregation, and reporting formulas that must be used by Abacus to meter, and report usage for each type of Cloud resource.

This API defines the contract between Abacus and the Cloud platform integrating it. The Cloud platform can manage and store _metering plan_ documents describing its Cloud resources in a platform specific way outside of Abacus, and is simply expected to make these documents available to Abacus at an API endpoint supporting a GET method.

### Method: get
_HTTP request_:
```
GET /v1/metering/plans/:metering_plan_id
```

_Description_: Retrieves the metering plan of the specified metering plan id.

_HTTP response_: 200 to indicate success with the requested _metering configuration_ document, 404 if the configuration is not found, 500 to report a server error.

### JSON representation:
```json
{
  "plan_id": "basic-object-storage",
  "measures": [
    {
      "name": "storage",
      "unit": "BYTE"
    },
    {
      "name": "api_calls",
      "units": "CALL"
    }
  ],
  "metrics": [
    {
      "name": "storage",
      "unit": "GIGABYTE",
      "meter": "(m) => m.storage / 1073741824",
      "accumulate": "(a, qty) => Math.max(a, qty)"
    },
    {
      "name": "thousand_api_calls",
      "unit": "THOUSAND_CALLS",
      "meter": "(m) => m.light_api_calls / 1000",
      "accumulate": "(a, qty) => a ? a + qty : qty",
      "aggregate": "(a, qty) => a ? a + qty : qty",
      "summarize": "(t, qty) => qty"
    }
  ]
}
```

### JSON schema:
```json
{
  "type": "object",
  "required": [
    "plan_id",
    "measures",
    "metrics"
  ],
  "properties": {
    "plan_id": {
      "type": "string"
    },
    "measures": {
      "type": "array",
      "minItems": "1",
      "items": {
        "type": "object",
        "required": [
          "name",
          "unit"
        ],
        "properties": {
          "name": {
            "type": "string"
          },
          "unit": {
            "type": "string"
          }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    },
    "metrics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "name",
          "unit"
        ],
        "properties": {
          "name": {
            "type": "string"
          },
          "unit": {
            "type": "string"
          },
          "meter": {
            "type": "string"
          },
          "accumulate": {
            "type": "string"
          },
          "aggregate": {
            "type": "string"
          },
          "summarize": {
            "type": "string"
          }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    },
  "additionalProperties": false,
  "title": "Metering Plan"
}
```

Rating plans
---

The _rating plans_ API is used by Abacus to retrieve _rating plan_ documents for Cloud resources.

_Rating plan_ documents describe the types of metrics, and rating, and charge formulas that must be used by Abacus to rate, and report usage for each type of Cloud resource.

This API defines the contract between Abacus and the Cloud platform integrating it. The Cloud platform can manage and store _rating plan_ documents describing its Cloud resources in a platform specific way outside of Abacus, and is simply expected to make these documents available to Abacus at an API endpoint supporting a GET method.

### Method: get
_HTTP request_:
```
GET /v1/rating/plans/:rating_plan_id
```

_Description_: Retrieves the rating plan of the specified rating plan id.

_HTTP response_: 200 to indicate success with the requested _rating plan_ document, 404 if the plan is not found, 500 to report a server error.

### JSON representation:
```json
{
  "plan_id": "object-rating-plan",
  "metrics": [
    {
      "name": "storage"
    },
    {
      "name": "thousand_api_calls",
      "rate": "(p, qty) => p ? p * qty : 0",
      "charge": "(t, cost) => cost"
    }
  ]
}
```

### JSON schema:
```json
{
  "type": "object",
  "required": [
    "plan_id",
    "metrics"
  ],
  "properties": {
    "plan_id": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "name"
        ],
        "properties": {
          "name": {
            "type": "string"
          },
          "rate": {
            "type": "string"
          },
          "charge": {
            "type": "string"
          }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    },
  "additionalProperties": false,
  "title": "Metering Plan"
}
```


Pricing plans
---

The _pricing plans_ API is used by Abacus to retrieve _pricing plan_ data for Cloud resources.

_Pricing plan_ documents are used to configure the prices of the metrics used to rate Cloud resources. Different prices can be defined for different countries.

This API defines the contract between Abacus and the Cloud platform integrating it. The Cloud platform can manage and store _pricing plan_ data for its Cloud resources in a platform specific way outside of Abacus, and is simply expected to make the pricing data available to Abacus at an API endpoint supporting a GET method.

### Method: get
_HTTP request_:
```
GET /v1/pricing/plans/:pricing_plan_id
```

_Description_: Retrieves the pricing of the specified pricing plan id.

_HTTP response_: 200 to indicate success with the requested _pricing plan_ data, 404 if the pricing data is not found, 500 to report a server error.

### JSON representation:
```json
{
  "plan_id": "object-pricing-basic",
  "metrics": [
    {
      "name": "storage",
      "prices": [
        {
          "country": "USA",
          "price": 1
        },
        {
          "country": "EUR",
          "price": 0.7523
        },
        {
          "country": "CAN",
          "price": 1.06
        }
      ]
    },
    {
      "name": "thousand_api_calls",
      "prices": [
        {
          "country": "USA",
          "price": 0.03
        },
        {
          "country": "EUR",
          "price": 0.0226
        },
        {
          "country": "CAN",
          "price": 0.0317
        }
      ]
    }
  ]
}
```

### JSON schema:
```json
{
  "title": "Price Plan",
  "type": "object",
  "properties": {
    "plan_id": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "title": "metric",
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "prices": {
            "type": "array",
            "minItems": 1,
            "items": {
              "title": "price",
              "type": "object",
              "properties": {
                "country": {
                  "type": "string"
                },
                "price": {
                  "type": "number"
                }
              },
              "required": [
                "country",
                "price"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "required": [
          "name",
          "prices"
        ],
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "required": [
    "plan_id",
    "metrics"
  ],
  "additionalProperties": false
}
```

Usage summary report
---

The _usage summary report_ API can be used to retrieve aggregated usage summary report documents from Abacus.

### Method: get
_HTTP request_:
```
GET /v1/metering/organizations/:organization_id/aggregated/usage/:time
```

_Description_: Retrieves a usage report document containing a summary of the aggregated Cloud resource usage incurred by the specified organization at the specified time.

_HTTP response_: 200 to indicate success with a _usage summary report_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON representation:
```json
{
  "start": 1435622400000,
  "end": 1435708799999,
  "processed": 1435708800000,
  "organization_id": "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
  "windows": [
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }]
  ],
  "id": "k-a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27-t-0001435622400000",
  "spaces": [
    {
      "space_id": "aaeae239-f3f8-483c-9dd0-de5d41c38b6a",
      "windows": [
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }]
      ],
      "consumers": [
        {
          "consumer_id": "app:d98b5916-3c77-44b9-ac12-045678edabae",
          "windows": [
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }]
          ],
          "resources": [
            {
              "resource_id": "object-storage",
              "charge": 46.09,
              "aggregated_usage": [
                {
                  "metric": "storage",
                  "windows": [
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }]
                  ]
                },
                {
                  "metric": "thousand_light_api_calls",
                  "windows": [
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }]
                  ]
                },
                {
                  "metric": "heavy_api_calls",
                  "windows": [
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }]
                  ]
                }
              ],
              "plans": [
                {
                  "plan_id": "basic",
                  "windows": [
                    [{
                      "charge": 46.09,
                    }],
                    [{
                      "charge": 46.09,
                    }],
                    [{
                      "charge": 46.09,
                    }],
                    [{
                      "charge": 46.09,
                    }],
                    [{
                      "charge": 46.09,
                    }]
                  ],
                  "aggregated_usage": [
                    {
                      "metric": "storage",
                      "windows": [
                        [{
                          "quantity": 1,
                          "summary": 1,
                          "cost": 1,
                          "charge": 1
                        }],
                        [{
                          "quantity": 1,
                          "summary": 1,
                          "cost": 1,
                          "charge": 1
                        }],
                        [{
                          "quantity": 1,
                          "summary": 1,
                          "cost": 1,
                          "charge": 1
                        }],
                        [{
                          "quantity": 1,
                          "summary": 1,
                          "cost": 1,
                          "charge": 1
                        }],
                        [{
                          "quantity": 1,
                          "summary": 1,
                          "cost": 1,
                          "charge": 1
                        }]
                      ]
                    },
                    {
                      "metric": "thousand_light_api_calls",
                      "windows": [
                        [{
                          "quantity": 3,
                          "summary": 3,
                          "cost": 0.09,
                          "charge": 0.09
                        }],
                        [{
                          "quantity": 3,
                          "summary": 3,
                          "cost": 0.09,
                          "charge": 0.09
                        }],
                        [{
                          "quantity": 3,
                          "summary": 3,
                          "cost": 0.09,
                          "charge": 0.09
                        }],
                        [{
                          "quantity": 3,
                          "summary": 3,
                          "cost": 0.09,
                          "charge": 0.09
                        }],
                        [{
                          "quantity": 3,
                          "summary": 3,
                          "cost": 0.09,
                          "charge": 0.09
                        }]
                      ]
                    },
                    {
                      "metric": "heavy_api_calls",
                      "windows": [
                        [{
                          "quantity": 300,
                          "summary": 300,
                          "cost": 45,
                          "charge": 45
                        }],
                        [{
                          "quantity": 300,
                          "summary": 300,
                          "cost": 45,
                          "charge": 45
                        }],
                        [{
                          "quantity": 300,
                          "summary": 300,
                          "cost": 45,
                          "charge": 45
                        }],
                        [{
                          "quantity": 300,
                          "summary": 300,
                          "cost": 45,
                          "charge": 45
                        }],
                        [{
                          "quantity": 300,
                          "summary": 300,
                          "cost": 45,
                          "charge": 45
                        }]
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      "resources": [
        {
          "resource_id": "object-storage",
          "windows": [
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }]
          ],
          "aggregated_usage": [
            {
              "metric": "storage",
              "windows": [
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }]
              ]
            },
            {
              "metric": "thousand_light_api_calls",
              "windows": [
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }]
              ]
            },
            {
              "metric": "heavy_api_calls",
              "windows": [
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }]
              ]
            }
          ],
          "plans": [
            {
              "plan_id": "basic",
              "windows": [
                [{
                  "charge": 46.09,
                }],
                [{
                  "charge": 46.09,
                }],
                [{
                  "charge": 46.09,
                }],
                [{
                  "charge": 46.09,
                }],
                [{
                  "charge": 46.09,
                }]
              ],
              "aggregated_usage": [
                {
                  "metric": "storage",
                  "windows": [
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }],
                    [{
                      "quantity": 1,
                      "summary": 1,
                      "charge": 1
                    }]
                  ]
                },
                {
                  "metric": "thousand_light_api_calls",
                  "windows": [
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }],
                    [{
                      "quantity": 3,
                      "summary": 3,
                      "charge": 0.09
                    }]
                  ]
                },
                {
                  "metric": "heavy_api_calls",
                  "windows": [
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }],
                    [{
                      "quantity": 300,
                      "summary": 300,
                      "charge": 45
                    }]
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "resources": [
    {
      "resource_id": "object-storage",
      "windows": [
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }],
        [{
          "charge": 46.09,
        }]
      ],
      "aggregated_usage": [
        {
          "metric": "storage",
          "windows": [
            [{
              "quantity": 1,
              "summary": 1,
              "charge": 1
            }],
            [{
              "quantity": 1,
              "summary": 1,
              "charge": 1
            }],
            [{
              "quantity": 1,
              "summary": 1,
              "charge": 1
            }],
            [{
              "quantity": 1,
              "summary": 1,
              "charge": 1
            }],
            [{
              "quantity": 1,
              "summary": 1,
              "charge": 1
            }]
          ]
        },
        {
          "metric": "thousand_light_api_calls",
          "windows": [
            [{
              "quantity": 3,
              "summary": 3,
              "charge": 0.09
            }],
            [{
              "quantity": 3,
              "summary": 3,
              "charge": 0.09
            }],
            [{
              "quantity": 3,
              "summary": 3,
              "charge": 0.09
            }],
            [{
              "quantity": 3,
              "summary": 3,
              "charge": 0.09
            }],
            [{
              "quantity": 3,
              "summary": 3,
              "charge": 0.09
            }]
          ]
        },
        {
          "metric": "heavy_api_calls",
          "windows": [
            [{
              "quantity": 300,
              "summary": 300,
              "charge": 45
            }],
            [{
              "quantity": 300,
              "summary": 300,
              "charge": 45
            }],
            [{
              "quantity": 300,
              "summary": 300,
              "charge": 45
            }],
            [{
              "quantity": 300,
              "summary": 300,
              "charge": 45
            }],
            [{
              "quantity": 300,
              "summary": 300,
              "charge": 45
            }]
          ]
        }
      ],
      "plans": [
        {
          "plan_id": "basic",
          "windows": [
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }],
            [{
              "charge": 46.09,
            }]
          ],
          "aggregated_usage": [
            {
              "metric": "storage",
              "windows": [
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }],
                [{
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                }]
              ]
            },
            {
              "metric": "thousand_light_api_calls",
              "windows": [
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }],
                [{
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                }]
              ]
            },
            {
              "metric": "heavy_api_calls",
              "windows": [
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }],
                [{
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }]
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### JSON schema:
```json
{
  "title": "organizationReport",
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "start": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "end": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "processed": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "organization_id": {
      "type": "string"
    },
    "windows": {
      "type": "array",
      "items": {
        "title": "cwindow",
        "type": "object",
        "properties": {
          "charge": {
            "type": "number"
          }
        },
        "required": [
          "charge"
        ]
      }
    },
    "resources": {
      "type": "array",
      "minItems": 1,
      "items": {
        "title": "resource",
        "type": "object",
        "properties": {
          "resource_id": {
            "type": "string"
          },
          "windows": {
            "type": "array",
            "items": {
              "title": "cwindow",
              "type": "object",
              "properties": {
                "charge": {
                  "type": "number"
                }
              },
              "required": [
                "charge"
              ]
            }
          },
          "aggregated_usage": {
            "type": "array",
            "minItems": 1,
            "items": {
              "title": "rmetric",
              "type": "object",
              "properties": {
                "metric": {
                  "type": "string"
                },
                "windows": {
                  "type": "array",
                  "items": {
                    "title": "rwindow",
                    "type": "object",
                    "properties": {
                      "quantity": {
                        "type": "number"
                      },
                      "summary": {
                        "type": "number"
                      },
                      "charge": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "quantity",
                      "summary",
                      "charge"
                    ]
                  }
                }
              },
              "required": [
                "metric",
                "windows"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          },
          "plans": {
            "type": "array",
            "minItems": 1,
            "items": {
              "title": "plan",
              "type": "object",
              "properties": {
                "plan_id": {
                  "type": "string"
                },
                "windows": {
                  "type": "array",
                  "items": {
                    "title": "cwindow",
                    "type": "object",
                    "properties": {
                      "charge": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "charge"
                    ]
                  }
                },
                "aggregated_usage": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "title": "pmetric",
                    "type": "object",
                    "properties": {
                      "metric": {
                        "type": "string"
                      },
                      "windows": {
                        "type": "array",
                        "items": {
                          "title": "pwindow",
                          "type": "object",
                          "properties": {
                            "quantity": {
                              "type": "number"
                            },
                            "summary": {
                              "type": "number"
                            },
                            "cost": {
                              "type": "number"
                            },
                            "charge": {
                              "type": "number"
                            }
                          },
                          "required": [
                            "quantity",
                            "summary",
                            "cost",
                            "charge"
                          ]
                        }
                      }
                    },
                    "required": [
                      "metric",
                      "windows"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "plan_id",
                "windows",
                "aggregated_usage"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "required": [
          "resource_id",
          "windows",
          "aggregated_usage",
          "plans"
        ],
        "additionalProperties": false
      },
      "additionalItems": false
    },
    "spaces": {
      "type": "array",
      "minItems": 1,
      "items": {
        "title": "space",
        "type": "object",
        "properties": {
          "space_id": {
            "type": "string"
          },
          "windows": {
            "type": "array",
            "items": {
              "title": "cwindow",
              "type": "object",
              "properties": {
                "charge": {
                  "type": "number"
                }
              },
              "required": [
                "charge"
              ]
            }
          },
          "resources": {
            "type": "array",
            "minItems": 1,
            "items": {
              "title": "resource",
              "type": "object",
              "properties": {
                "resource_id": {
                  "type": "string"
                },
                "windows": {
                  "type": "array",
                  "items": {
                    "title": "cwindow",
                    "type": "object",
                    "properties": {
                      "charge": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "charge"
                    ]
                  }
                },
                "aggregated_usage": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "title": "rmetric",
                    "type": "object",
                    "properties": {
                      "metric": {
                        "type": "string"
                      },
                      "windows": {
                        "type": "array",
                        "items": {
                          "title": "rwindow",
                          "type": "object",
                          "properties": {
                            "quantity": {
                              "type": "number"
                            },
                            "summary": {
                              "type": "number"
                            },
                            "charge": {
                              "type": "number"
                            }
                          },
                          "required": [
                            "quantity",
                            "summary",
                            "charge"
                          ]
                        }
                      }
                    },
                    "required": [
                      "metric",
                      "windows"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                },
                "plans": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "title": "plan",
                    "type": "object",
                    "properties": {
                      "plan_id": {
                        "type": "string"
                      },
                      "windows": {
                        "type": "array",
                        "items": {
                          "title": "cwindow",
                          "type": "object",
                          "properties": {
                            "charge": {
                              "type": "number"
                            }
                          },
                          "required": [
                            "charge"
                          ]
                        }
                      },
                      "aggregated_usage": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                          "title": "pmetric",
                          "type": "object",
                          "properties": {
                            "metric": {
                              "type": "string"
                            },
                            "windows": {
                              "type": "array",
                              "items": {
                                "title": "pwindow",
                                "type": "object",
                                "properties": {
                                  "quantity": {
                                    "type": "number"
                                  },
                                  "summary": {
                                    "type": "number"
                                  },
                                  "cost": {
                                    "type": "number"
                                  },
                                  "charge": {
                                    "type": "number"
                                  }
                                },
                                "required": [
                                  "quantity",
                                  "summary",
                                  "cost",
                                  "charge"
                                ]
                              }
                            }
                          },
                          "required": [
                            "metric",
                            "windows"
                          ],
                          "additionalProperties": false
                        },
                        "additionalItems": false
                      }
                    },
                    "required": [
                      "plan_id",
                      "windows",
                      "aggregated_usage"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "resource_id",
                "windows",
                "aggregated_usage",
                "plans"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          },
          "consumers": {
            "type": "array",
            "minItems": 1,
            "items": {
              "title": "consumer",
              "type": "object",
              "properties": {
                "consumer_id": {
                  "type": "string"
                },
                "windows": {
                  "type": "array",
                  "items": {
                    "title": "cwindow",
                    "type": "object",
                    "properties": {
                      "charge": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "charge"
                    ]
                  }
                },
                "resources": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "title": "resource",
                    "type": "object",
                    "properties": {
                      "resource_id": {
                        "type": "string"
                      },
                      "windows": {
                        "type": "array",
                        "items": {
                          "title": "cwindow",
                          "type": "object",
                          "properties": {
                            "charge": {
                              "type": "number"
                            }
                          },
                          "required": [
                            "charge"
                          ]
                        }
                      },
                      "aggregated_usage": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                          "title": "rmetric",
                          "type": "object",
                          "properties": {
                            "metric": {
                              "type": "string"
                            },
                            "windows": {
                              "type": "array",
                              "items": {
                                "title": "rwindow",
                                "type": "object",
                                "properties": {
                                  "quantity": {
                                    "type": "number"
                                  },
                                  "summary": {
                                    "type": "number"
                                  },
                                  "charge": {
                                    "type": "number"
                                  }
                                },
                                "required": [
                                  "quantity",
                                  "summary",
                                  "charge"
                                ]
                              }
                            }
                          },
                          "required": [
                            "metric",
                            "windows"
                          ],
                          "additionalProperties": false
                        },
                        "additionalItems": false
                      },
                      "plans": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                          "title": "plan",
                          "type": "object",
                          "properties": {
                            "plan_id": {
                              "type": "string"
                            },
                            "windows": {
                              "type": "array",
                              "items": {
                                "title": "cwindow",
                                "type": "object",
                                "properties": {
                                  "charge": {
                                    "type": "number"
                                  }
                                },
                                "required": [
                                  "charge"
                                ]
                              }
                            },
                            "aggregated_usage": {
                              "type": "array",
                              "minItems": 1,
                              "items": {
                                "title": "pmetric",
                                "type": "object",
                                "properties": {
                                  "metric": {
                                    "type": "string"
                                  },
                                  "windows": {
                                    "type": "array",
                                    "items": {
                                      "title": "pwindow",
                                      "type": "object",
                                      "properties": {
                                        "quantity": {
                                          "type": "number"
                                        },
                                        "summary": {
                                          "type": "number"
                                        },
                                        "cost": {
                                          "type": "number"
                                        },
                                        "charge": {
                                          "type": "number"
                                        }
                                      },
                                      "required": [
                                        "quantity",
                                        "summary",
                                        "cost",
                                        "charge"
                                      ]
                                    }
                                  }
                                },
                                "required": [
                                  "metric",
                                  "windows"
                                ],
                                "additionalProperties": false
                              },
                              "additionalItems": false
                            }
                          },
                          "required": [
                            "plan_id",
                            "windows",
                            "aggregated_usage"
                          ],
                          "additionalProperties": false
                        },
                        "additionalItems": false
                      }
                    },
                    "required": [
                      "resource_id",
                      "windows",
                      "aggregated_usage",
                      "plans"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "consumer_id",
                "windows",
                "resources"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "required": [
          "space_id",
          "windows",
          "resources",
          "consumers"
        ],
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "required": [
    "id",
    "organization_id",
    "start",
    "end",
    "processed",
    "windows",
    "resources",
    "spaces"
  ],
  "additionalProperties": false
}
```
Resource instance usage summary report
---

The _resource instance usage summary report_ API can be used to retrieve aggregated usage summary report documents for a resource instance from Abacus.

### Method: get
_HTTP request_:
```
GET /v1/metering/organizations/:organization_id/resource_instances/:resource_instance_id/consumers/:consumer_id/plans/:plan_id/metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/pricing_plans/:pricing_plan_id/aggregated/usage/:time
```

_Description_: Retrieves a usage report document containing a summary of the aggregated Cloud resource usage incurred by the specified resource instance within an organization and the specific set of plans at the specified time.

_HTTP response_: 200 to indicate success with a _usage summary report_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON representation:
```json
{
  "start": 1435622400000,
  "end": 1435708799999,
  "processed": 1435708800000,
  "organization_id": "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
  "plan_id": "basic",
  "metering_plan_id": "test-metering-plan",
  "rating_plan_id": "test-rating-plan",
  "pricing_plan_id": "test-pricing-basic",
  "consumer_id": "app:d98b5916-3c77-44b9-ac12-045678edabae",
  "resource_instance_id": "0b39fa70-a65f-4183-bae8-385633ca5c87",
  "space_id": "aaeae239-f3f8-483c-9dd0-de5d41c38b6a",
  "resource_id": "object-storage",
  "accumulated_usage": [
    {
      "metric": "storage",
      "windows": [
        [{
          "quantity": 1,
          "summary": 1,
          "cost": 1,
          "charge": 1
        }],
        [{
          "quantity": 1,
          "summary": 1,
          "cost": 1,
          "charge": 1
        }],
        [{
          "quantity": 1,
          "summary": 1,
          "cost": 1,
          "charge": 1
        }],
        [{
          "quantity": 1,
          "summary": 1,
          "cost": 1,
          "charge": 1
        }],
        [{
          "quantity": 1,
          "summary": 1,
          "cost": 1,
          "charge": 1
        }]
      ]
    },
    {
      "metric": "thousand_light_api_calls",
      "windows": [
        [{
          "quantity": 3,
          "summary": 3,
          "cost": 0.09,
          "charge": 0.09
        }],
        [{
          "quantity": 3,
          "summary": 3,
          "cost": 0.09,
          "charge": 0.09
        }],
        [{
          "quantity": 3,
          "summary": 3,
          "cost": 0.09,
          "charge": 0.09
        }],
        [{
          "quantity": 3,
          "summary": 3,
          "cost": 0.09,
          "charge": 0.09
        }],
        [{
          "quantity": 3,
          "summary": 3,
          "cost": 0.09,
          "charge": 0.09
        }]
      ]
    },
    {
      "metric": "heavy_api_calls",
      "windows": [
        [{
          "quantity": 300,
          "summary": 300,
          "cost": 45,
          "charge": 45
        }],
        [{
          "quantity": 300,
          "summary": 300,
          "cost": 45,
          "charge": 45
        }],
        [{
          "quantity": 300,
          "summary": 300,
          "cost": 45,
          "charge": 45
        }],
        [{
          "quantity": 300,
          "summary": 300,
          "cost": 45,
          "charge": 45
        }],
        [{
          "quantity": 300,
          "summary": 300,
          "cost": 45,
          "charge": 45
        }]
      ]
    }
  ],
  "windows": [
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }],
    [{
      "charge": 46.09,
    }]
  ],
  "id": "k/us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/0b39fa70-a65f-4183-bae8-385633ca5c87/app:d98b5916-3c77-44b9-ac12-045678edabae/basic/test-metering-plan/test-rating-plan/test-pricing-basic/t/0001435622400000",
}
```

### JSON schema:
```json
{
  "title": "resourceInstanceReport",
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "start": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "end": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "processed": {
      "type": "integer",
      "format": "utc-millisec"
    },
    "organization_id": {
      "type": "string"
    },
    "space_id": {
      "type": "string"
    },
    "resource_instance_id": {
      "type": "string"
    },
    "consumer_id": {
      "type": "string"
    },
    "plan_id": {
      "type": "string"
    },
    "metering_plan_id": {
      "type": "string"
    },
    "rating_plan_id": {
      "type": "string"
    },
    "pricing_plan_id": {
      "type": "string"
    },
    "accumulated_usage": {
      "type": "array",
      "items": {
        "title": "accumulated",
        "type": "object",
        "properties": {
          "metric": {
            "type": "string"
          },
          "windows": {
            "type": "array",
            "items": {
              "title": "pwindow",
              "type": "object",
              "properties": {
                "quantity": {
                  "type": "number"
                },
                "summary": {
                  "type": "number"
                },
                "cost": {
                  "type": "number"
                },
                "charge": {
                  "type": "number"
                }
              },
              "required": [
                "quantity",
                "summary",
                "cost",
                "charge"
              ]
            }
          }
        }
      },
      "required": [
        "metric",
        "windows"
      ]
    },
    "windows": {
      "type": "array",
      "items": {
        "title": "cwindow",
        "type": "object",
        "properties": {
          "charge": {
            "type": "number"
          }
        },
        "required": [
          "charge"
        ]
      }
    }
  },
  "required": [
    "id",
    "organization_id",
    "space_id",
    "resource_instance_id",
    "consumer_id",
    "resource_id",
    "plan_id",
    "metering_plan_id",
    "rating_plan_id",
    "pricing_plan_id",
    "start",
    "end",
    "processed",
    "accumulated_usage",
    "windows"
  ],
  "additionalProperties": false
}
```

GraphQL usage query
---

The _GraphQL usage query_ API can be used to query aggregated usage using the [GraphQL](https://github.com/facebook/graphql) query language.

Abacus defines a GraphQL schema for aggregated usage, allowing users to navigate and query the graph of aggregated usage within organizations and the spaces and resources they contain using the [GraphQL](https://github.com/facebook/graphql) query language.

The GraphQL schema listed below describes the graph used to represent aggregated usage, as well as the supported usage queries.

See the [GraphQL](https://github.com/facebook/graphql) documentation for more information on the GraphQL schema and query languages.

### Method: get
_HTTP request_:
```
GET /v1/metering/aggregated/usage/graph/:query
```

_Description_: Retrieves a usage report document containing a summary of the Cloud resource usage matching the specified GraphQL query.

_HTTP response_: 200 to indicate success with a _usage summary report_ JSON document, 404 if the usage is not found, 500 to report a server error.

### Example GraphQL queries:

```graphql
{
  organization(
    organization_id: "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      resources {
        resource_id,
        aggregated_usage {
          metric,
          windows {
            quantity
          }
        }
      }
    }
}

{
  organization(
    organization_id: "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      spaces {
        space_id,
        resources {
          resource_id,
          aggregated_usage {
            metric,
            windows {
              quantity
            }
          }
        }
      }
    }
}

{
  organization(
    organization_id: "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      spaces {
        space_id,
        consumers {
          consumer_id,
          resources {
            resource_id,
            aggregated_usage {
              metric,
              windows {
                quantity
              }
            }
          }
        }
      }
    }
}

{
  organization(
    organization_id: "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      spaces {
        space_id,
        consumers {
          consumer_id
        }
      }
    }
}

{
  organization(
    organization_id: "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      resources {
        resource_id,
        aggregated_usage {
          metric,
          windows {
            quantity
          }
        }
      }
    }
}

{
  organizations(
    organization_ids: [
      "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",                                      
      "us-south:b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28"],
    time: 1435622400000) {
      organization_id,
      resources {
        resource_id,
        aggregated_usage {
          metric,
          windows {
            quantity
          }
        }
      }
    }
}

{
  account(
    account_id: "1234",
    time: 1435622400000) {
      organization_id,
      resources {
        resource_id,
        aggregated_usage {
          metric,
          windows {
            quantity
          }
        }
      }
    }
}

{
  resource_instance(
    organization_id: "us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    consumer_id: "bbeae239-f3f8-483c-9dd0-de6781c38bab",
    resource_instance_id: "0b39fa70-a65f-4183-bae8-385633ca5c87",
    plan_id: "basic",
    time: time: 1435622400000) {
      organization_id,
      space_id,
      resource_id,
      resource_instance_id,
      plan_id,
      accumulated_usage {
        metric,
        windows {
          summary,
          charge
        }
      }
    }
}
```

### GraphQL schema:
```graphql
type ChargeWindow {
  charge: Float
}

type PlanWindow {
  quantity: Float
  cost: Float
  summary: Float
  charge: Float
}

type PlanMetric {
  metric: String
  windows: [[PlanWindow]]
}

type Plan {
  plan_id: String
  windows: [[ChargeWindow]]
  aggregated_usage: [PlanMetric]
}

type ResourceWindow {
  quantity: Float
  summary: Float
  charge: Float
}

type ResourceMetric {
  metric: String
  windows: [[ResourceWindow]]
}

type Resource {
  resource_id: String
  windows: [[ChargeWindow]]
  aggregated_usage: [ResourceMetric]
  plans: [Plan]
}

type Consumer {
  consumer_id: String
  windows: [[ChargeWindow]]
  resources: [Resource]
}

type Space {
  space_id: String
  windows: [[ChargeWindow]]
  resources: [Resource]
  consumers: [Consumer]
}

type OrganizationReport {
  id: String
  start: Int
  end: Int
  organization_id: String
  windows: [[ChargeWindow]]
  resources: [Resource]
  spaces: [Space]
}

type resourceInstanceReport {
  id: String
  start: Int
  end: Int
  organization_id: String
  space_id: String
  resource_id: String
  resource_instance_id: String
  consumer_id: String
  plan_id: String
  windows: [[ChargeWindow]]
  accumulated_usage: [PlanMetric]
}

type Query {
  organization(
    organization_id: String!,
    time: Int) : OrganizationReport

  organizations(
    organization_ids: [String],
    time: Int) : [OrganizationReport]

  account(
    account_id: String!,
    time: Int) : [OrganizationReport]
}
```

