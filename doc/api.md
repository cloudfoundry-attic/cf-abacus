Abacus Metering REST API
===

The Abacus Metering REST API is used by service providers and runtimes to submit usage data, usage dashboards to retrieve real time usage reports and usage summaries, and billing systems to retrieve the aggregated and rated usage data needed for billing. 

This API reference is organized by REST resource type. Each resource type has a JSON representation and one or more methods.

Resource types
---

Service usage

Service instance usage

Runtime usage

Usage summary

Usage report

Service definition

Service usage
---

The _service usage_ API is used by service providers to submit service usage data to Abacus.

Usage can be submitted for a given service by POSTing batches of usage data assembled in _service usage_ JSON documents.

Once a batch of usage has been submitted it can be retrieved using GET.

### Method: insert
_HTTP request_: POST /v1/metering/services/:service\_id/usage, with an optional ?region=:region parameter, and a _service usage_ JSON document.

_Description_: Creates a batch of usage resources for the specified service.

_HTTP response_: 201 to indicate success with the new resource URL in a Location header, 400 to report an invalid request, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/metering/services/:service\_id/usage/:usage\_batch\_id

_Description_: Retrieves a batch of usage resources for the specified service and usage id.

_HTTP response_: 200 to indicate success with a _service usage_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON Resource representation:
```json
{
  "service_instances":[
    {
      "service_instance_id":"d98b5916-3c77-44b9-ac12-04d61c7a4eae",
      "usage":[
        {
          "start":1396421450000,
          "end":1396421451000,
          "organization_guid":"54257f98-83f0-4eca-ae04-9ea35277a538",
          "space_guid":"d98b5916-3c77-44b9-ac12-04456df23eae",
          "plan_id": "sample-plan",
          "consumer":{
            "type":"cloud-foundry-application",
            "value":"d98b5916-3c77-44b9-ac12-045678edabae"
          },
          "resources":[
            {
              "unit":"GIGABYTE",
              "quantity":10
            },
            {
              "unit":"API_CALL",
              "quantity":10
            }
          ]
        }
      ]
    }
  ]
}
```

### JSON Schema:
```json
{
  "title": "Service Usage",
  "description": "Usage data for a service",
  "required": ["service_instances"],
  "type": "object",
  "properties": {
    "service_instances": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["service_instance_id", "usage"],
        "properties": {
            "service_instance_id": {
              "type": "string"
            },
            "usage": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["start", "end", "plan_id",
                    "organization_guid", "space_guid", "resources"],
                "properties": {
                    "start": {
                      "type": "integer",
                      "format": "utc-millisec"
                    },
                    "end": {
                      "type": "integer",
                      "format": "utc-millisec"
                    },
                    "plan_id": {
                      "type": "string"
                    },
                    "region": {
                      "type": "string"
                    },
                    "organization_guid": {
                      "type": "string"
                    },
                    "space_guid": {
                      "type": "string"
                    },
                    "consumer": {
                      "type": "object",
                      "required": ["type", "value"],
                      "properties": {
                        "type": {
                          "enum": ["cloud_foundry_application", "external"],
                          "default": "cloud_foundry_application"
                        },
                        "value": {
                          "type": "string"
                        }
                      },
                      "additionalProperties": false
                    },
                    "resources": {
                      "type": "array",
                      "minItems": 1,
                      "items": {
                        "type": "object",
                        "required": ["unit", "quantity"],
                        "properties": {
                          "name": {
                            "type": "string"
                          },
                          "unit": {
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
                "additionalProperties": false
              },
              "additionalItems": false
            }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties": false
}
```

Service instance usage
---

The _service instance usage_ API is used by service providers to submit service usage data to Abacus.

Usage can be submitted for a given service instance by POSTing batches of usage data assembled in _service instance usage_ JSON documents.

Once a batch of usage has been submitted it can be retrieved using GET.

### Method: insert
_HTTP request_: POST /v1/metering/service\_instances/:service\_instance\_id/usage, with an optional ?region=:region parameter, and a _service instance usage_ JSON document.

_Description_: Creates a batch of usage resources for the specified service instance.

_HTTP response_: 201 to indicate success with the new resource URL in a Location header, 400 to report an invalid request, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/metering/service\_instances/:service\_instance\_id/usage/:usage\_id

_Description_: Retrieves a batch of usage resources for the specified service instance and usage id.

_HTTP response_: 200 to indicate success with a _service instance usage_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON Resource representation:
```json
{
  "service_id":"d98b5916-3c77-44b9-ac12-04d61c7a4eae",
  "usage":[
    {
      "start":1396421450000,
      "end":1396421451000,
      "organization_guid":"54257f98-83f0-4eca-ae04-9ea35277a538",
      "space_guid":"d98b5916-3c77-44b9-ac12-04d61c7123df",
      "plan_id": "sample-plan",
      "consumer":{
        "type":"cloud-foundry-application",
        "value":"d98b5916-3c77-44b9-ac12-046780abc45e"
      },
      "resources":[
        {
          "unit":"GIGABYTE",
          "quantity":10
        },
        {
          "unit":"API_CALL",
          "quantity":10
        }
      ]
    }
  ]
}
```

### JSON Schema:
```json
{
  "title": "Service Instance Usage",
  "description": "Usage data for a service instance",
  "type": "object",
  "required": ["service_id", "usage"],
  "properties": {
    "service_id": {
      "type": "string"
    },
    "usage": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["start", "end", "plan_id",
            "organization_guid", "space_guid", "resources"],
        "properties": {
            "start": {
              "type": "integer",
              "format": "utc-millisec"
            },
            "end": {
              "type": "integer",
              "format": "utc-millisec"
            },
            "plan_id": {
              "type": "string"
            },
            "region": {
              "type": "string"
            },
            "organization_guid": {
              "type": "string"
            },
            "space_guid": {
              "type": "string"
            },
            "consumer": {
              "type": "object",
              "required": ["type", "value"],
              "properties": {
                "type": {
                  "enum": ["cloud_foundry_application", "external"],
                  "default": "cloud_foundry_application"
                },
                "value": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "resources": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["unit", "quantity"],
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "unit": {
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
        "additionalProperties": false
      },
      "additionalItems": false
    },
    "additionalProperties": false
  }
}
```


Runtime usage
---

The _runtime usage_  API is used to submit runtime usage data to Abacus.

Usage can be submitted for a given runtime by POSTing batches of usage data assembled in _runtime usage_ JSON documents.

Once a batch of usage has been submitted it can be retrieved using GET.

### Method: insert
_HTTP request_: POST /v1/runtimes/:runtime\_id/usage, with an optional ?region=:region parameter, and a _runtime usage_ JSON document.

_Description_: Creates a batch of usage resources for the specified runtime.

_HTTP response_: 201 to indicate success with the new resource URL in a Location header, 400 to report an invalid request, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/runtimes/:runtime\_id/usage/:usage\_usage\_id

_Description_: Retrieves a batch of usage resources for the specified runtime and usage id.

_HTTP response_: 200 to indicate success with a _runtime usage_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON Resource representation:
```json
{
  "usage": [
    {
      "start": 1423686058000,
      "end": 1423686115000,
      "organization_guid": "ba0c4b54-013c-4fca-af31-6bfb9abd3e5f",
      "space_guid": "900f5c68-0910-4faf-84ed-24c0b805a9dd",
      "plan_id": "sample-plan",
      "consumer": {
        "type": "cloud_foundry_application",
        "value": "d3f3f7d1-fb9d-42cf-8a32-22437cba031a"
      },
      "resources": [
        {
          "unit": "INSTANCE",
          "quantity": 1
        },
        {
          "unit": "GIGABYTE",
          "quantity": 0.5
        },
        {
          "unit": "HOUR",
          "quantity": 0.02
        }
      ]
    }
  ]
}
```

### JSON Schema:
```json
{
  "title": "Runtime Usage",
  "description": "Usage data for a runtime",
  "type": "object",
  "required": ["usage"],
  "properties": {
    "usage": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["start", "end", "plan_id",
            "organization_guid", "space_guid", "resources"],
        "properties": {
            "start": {
              "type": "integer",
              "format": "utc-millisec"
            },
            "end": {
              "type": "integer",
              "format": "utc-millisec"
            },
            "plan_id": {
              "type": "string"
            },
            "region": {
              "type": "string"
            },
            "organization_guid": {
              "type": "string"
            },
            "space_guid": {
              "type": "string"
            },
            "consumer": {
              "type": "object",
              "required": ["value"],
              "properties": {
                "type": {
                  "enum": ["cloud_foundry_application"],
                  "default": "cloud_foundry_application"
                },
                "value": {
                  "type": "string"
                }
              },
              "additionalProperties": false
            },
            "resources": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["unit", "quantity"],
                "properties": {
                  "name": {
                    "type": "string"
                  },
                  "unit": {
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
        "additionalProperties": false
      },
      "additionalItems": false
    },
    "additionalProperties": false
  }
}
```


Usage summary
---

The _usage summary_ API is used to retrieve usage summaries from Abacus.

### Method: get
_HTTP request_: GET /v1/accounts/:account\_id/usage\_summary

_Description_: Retrieves a usage summary for the specified account. An account is defined by Abacus as a collection of organizations managed by a single billing entity.

_HTTP response_: 200 to indicate success with a _usage summary_ JSON document, 404 if the usage is not found, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/organizations/:organization\_id/usage\_summary

_Description_: Retrieves a usage report for the specified organization.

_HTTP response_: 200 to indicate success with a _usage summary_ JSON document, 404 if the usage is not found, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/organizations/:organization\_ids\_array/usage\_summary

_Description_: Retrieves a usage report for the specified organizations.

_HTTP response_: 200 to indicate success with a _usage summary_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON Resource representation:
```json
{
  "summary": [
    {
      "billable_usage": {
        "services_cost": 847.8870967741937,
        "support": {
          "type": "",
          "cost": 0
        },
        "subscription": {
          "cost": 0
        },
        "runtime_cost": 0
      },
      "organizations": [
        {
          "region": "us-south",
          "id": "2b5ab364-b02f-4119-86f8-9e0b95143c77",
          "billable_usage": {
            "services_cost": 939.8551612903225,
            "runtime_usage": 1906.025,
            "runtime_cost": 132.37175,
            "applications": 9,
            "service_instances": 12
          },
          "name": "sampleorg",
          "non_billable_usage": {
            "services_cost": 0,
            "runtime_usage": 0,
            "runtime_cost": 0,
            "applications": 0,
            "service_instances": 0
          },
          "currency_code": "USD"
        }
      ],
      "month": "2014-10",
      "non_billable_usage": {
        "services_cost": 0,
        "support": {
          "type": "",
          "cost": 0
        },
        "subscription": {
          "cost": 0
        },
        "runtime_cost": 0
      }
    }
  ],
  "id": "40df7d7e841701cbb8f4dafa8b9ed16c",
  "currency_code": "USD"
}
```

Usage report
---

The _usage report_ API is used to retrieve usage reports from Abacus.

### Method: get
_HTTP request_: GET /v1/accounts/:account\_id/usage/:month

_Description_: Retrieves a usage report for an account for the given month. An account is defined by Abacus as a collection of organizations managed by a single billing entity.

_HTTP response_: 200 to indicate success with a _usage report_ JSON document, 404 if the usage is not found, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/organizations/:organization\_id/usage/:month

_Description_: Retrieves a usage report for an organization for the given month.

_HTTP response_: 200 to indicate success with a _usage report_ JSON document, 404 if the usage is not found, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/organizations/:organization\_ids\_array/usage/:month

_Description_: Retrieves a usage report for a list of organizations for the given month.

_HTTP response_: 200 to indicate success with a _usage report_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON Resource representation:
```json
{
  "summary": {
    "billable_usage": {
      "services_cost": 14093.262857142858,
      "support": {
        "type": "",
        "cost": 0
      },
      "subscription": {
        "cost": 0
      },
      "runtime_cost": 345.48493984375006
    },
    "organizations": [
      {
        "region": "us-south",
        "id": "2b5ab364-b02f-4119-86f8-9e0b95143c77",
        "billable_usage": {
          "services_cost": 11132.985676980104,
          "runtime_usage": 5165.218626111111,
          "runtime_cost": 361.56530382777777,
          "applications": 24,
          "service_instances": 36
        },
        "name": "sampleorg",
        "non_billable_usage": {
          "services_cost": 0,
          "runtime_usage": 0,
          "runtime_cost": 0,
          "applications": 0,
          "service_instances": 0
        }
      }
    ],
    "non_billable_usage": {
      "services_cost": 0,
      "support": {
        "type": "",
        "cost": 0
      },
      "subscription": {
        "cost": 0
      },
      "runtime_cost": 0
    }
  },
  "id": "40df7d7e841701cbb8f4dafa8b9ed16c",
  "billable_usage": {
    "services": [
      {
        "id": "cloudant",
        "plans": [
          {
            "id": "cloudant-shared",
            "name": "cloudant-shared",
            "usage": [
              {
                "unit": "HEAVY_API_CALL",
                "quantity": 1861,
                "cost": 0,
                "unitId": "HEAVY_API_CALLS_PER_MONTH"
              },
              {
                "unit": "LIGHT_API_CALL",
                "quantity": 0,
                "cost": 0,
                "unitId": "LIGHT_API_CALLS_PER_MONTH"
              },
              {
                "unit": "GIGABYTE",
                "quantity": 9.545204777270555,
                "cost": 0,
                "unitId": "STORAGE_PER_MONTH"
              }
            ]
          }
        ],
        "name": "cloudantNoSQLDB"
      }
    ],
    "runtimes": [
      {
        "id": "sdk-for-nodejs",
        "plans": [
          {
            "id": "04082014.ibm.node.default",
            "name": "04082014.ibm.node.default",
            "usage": [
              {
                "unit": "GB-HOURS",
                "quantity": 506.03352006944453,
                "cost": 9.172346404861116,
                "unitId": "GB_HOURS_PER_MONTH"
              }
            ]
          }
        ],
        "name": "sdk-for-nodejs"
      }
    ]
  },
  "organizations": [
    {
      "region": "eu-gb",
      "id": "2946051b-f24a-440a-859c-6cff77fe32d9",
      "billable_usage": {
        "spaces": [
          {
            "id": "a9008905-ebab-47b9-b646-52aceb89d79d",
            "services": [
              {
                "id": "46e77ec4-9a61-46b8-9955-2eef91559a22",
                "name": "sqldb",
                "instances": [
                  {
                    "id": "ce1a031c-6522-48bc-a68d-57a01e80aae2",
                    "name": "SQL Database-bo",
                    "usage": [
                      {
                        "unit": "GIGABYTE",
                        "applicationId": null,
                        "quantity": 0.0003662109375,
                        "cost": 0,
                        "unitId": "STORAGE_PER_MONTH"
                      }
                    ],
                    "plan_id": "another-plan"
                  }
                ]
              },
              {
                "id": "cloudant",
                "instances": [
                  {
                    "id": "f4aec91b-13b7-4b7b-a9ab-dc9cc9d33f2b",
                    "name": "Cloudant NoSQL DB-js",
                    "usage": [
                      {
                        "unit": "HEAVY_API_CALL",
                        "applicationId": null,
                        "quantity": 298,
                        "cost": 0.15,
                        "unitId": "HEAVY_API_CALLS_PER_MONTH"
                      },
                      {
                        "unit": "LIGHT_API_CALL",
                        "applicationId": null,
                        "quantity": 0,
                        "cost": 0,
                        "unitId": "LIGHT_API_CALLS_PER_MONTH"
                      },
                      {
                        "unit": "GIGABYTE",
                        "applicationId": null,
                        "quantity": 0,
                        "cost": 0,
                        "unitId": "STORAGE_PER_MONTH"
                      }
                    ],
                    "plan_id": "database-plan"
                  }
                ]
              },
            ],
            "name": "MQA-LON",
            "applications": [
              {
                "id": "b407363e-1ea4-4ef3-a7e4-ee25ff85a0dd",
                "name": "ratingruntimesample",
                "usage": [
                  {
                    "unit": "GB-HOURS",
                    "buildpack": "e1120997-dcfe-4055-a6c9-9b23e33df1f2",
                    "runtime": {
                      "id": "e1120997-dcfe-4055-a6c9-9b23e33df1f2",
                      "name": "liberty-for-java_v1-8-20141118-1610"
                    },
                    "quantity": 227.2774475,
                    "cost": 15.909421325,
                    "unitId": "GB_HOURS_PER_MONTH"
                  }
                ]
              }
            ]
          }
        ]
      },
      "name": "sampleorg",
      "non_billable_usage": {
        "spaces": []
      },
      "currency_code": "USD"
    }
  ],
  "non_billable_usage": {
    "services": [],
    "runtimes": []
  },
  "currency_code": "USD"
}
```

Service definition
---

Service definitions are used to configure Abacus with the types of resources, units, metering, aggregation and rating formulas that should be used to meter and rate usage for a particular service.

Service definitions are currently provided as JSON configuration files, but a simple REST API could also be defined for them.

### JSON Resource representation:
```json
{
  "id": "Service-8e9f8a35-dc03-4192-8bba-a77ae60222eb",
  "resources": [
    {
      "name": "Storage",
      "units": [
        {
          "name": "GIGABYTE",
          "quantityType": "CURRENT"
        }
      ]
    },
    {
      "name": "ApiCalls",
      "units": [
        {
          "name": "API_CALL",
          "quantityType": "DELTA"
        }
      ]
    }
  ],
  "aggregations": [
    {
      "id": "GB_PER_MONTH",
      "unit": "GIGABYTE",
      "aggregationGroup": {
        "name": "monthly"
      },
      "formula": "AVG({GIGABYTE})"
    },
    {
      "id": "API_CALLS_PER_MONTH",
      "unit": "API_CALL",
      "aggregationGroup": {
        "name": "monthly"
      },
      "formula": "SUM({API_CALL})"
    }
  ]
}
```

### JSON Schema:
```json
{
  "title": "Service Definition",
  "description": "Defines the resources, units, metering, aggregation and rating formulas used to meter a particular service",
  "type": "object",
  "required": ["id", "resources", "aggregations"],
  "properties": {
    "id": {
      "type": "string"
    },
    "resources": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["units"],
        "properties": {
          "name": {
            "type": "string"
          },
          "units" : {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": ["name", "quantityType"],
              "properties": {
                "name": {
                  "type": "string"
                },
                "quantityType": {
                  "enum" : [ "DELTA", "CURRENT"]
                }
              },
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    },
    "aggregations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "unit", "formula"],
        "properties": {
          "id": {
            "type": "string"
          },
          "unit": {
            "type": "string"
          },
          "aggregationGroup": {
            "type": "object",
            "required": ["name"],
            "properties": {
              "name": {
                "enum": ["daily", "monthly"]
              },
              "additionalProperties": false
            }
          },
          "formula": {
          },
          "accumulate": {
          },
          "aggregate": {
          },
          "rate": {
          }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties":  false
}
```

