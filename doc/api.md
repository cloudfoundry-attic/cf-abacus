Abacus Metering and Aggregation REST API
===

The Abacus Usage Metering and Aggregation REST API is used by Cloud resource providers to submit usage data, usage dashboards to retrieve real time usage reports and usage summaries, and billing systems to retrieve the aggregated and rated usage data needed for billing. Cloud resources include services and application runtimes for example.

Usage data is exchanged with Abacus in the form of usage documents. Each document type has a JSON representation and one or more methods.

Document types
---

Resource usage

Resource configuration

Usage summary

Usage report

Resource usage
---

The _resource usage_ API is used by Cloud resource providers to submit usage for instances of Cloud resources, including service instances and application runtimes.

Usage can be submitted by POSTing _resource usage_ documents to Abacus.

A _resource usage document_ contains usage data for one or more Cloud resources.

Once a _resource usage_ document has been submitted it can be retrieved using GET.

### Method: insert
_HTTP request_: POST /v1/metering/resource/usage with a _resource usage_ document.

_Description_: Records the _resource usage_ document and processes the Cloud resource usage data it contains.

_HTTP response_: 201 to indicate success with the URL of the _resource usage_ document in a Location header, 400 to report an invalid request, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/metering/resource/usage/:usage\_document\_id

_Description_: Retrieves a previously submitted _resource usage_ document.

_HTTP response_: 200 to indicate success with the requested _resource usage_ document, 404 if the usage is not found, 500 to report a server error.

### JSON representation:
```json
{
  "usage": [
    {
      "start": 1396421450000,
      "end": 1396421451000,
      "organization_id": "54257f98-83f0-4eca-ae04-9ea35277a538",
      "space_id": "d98b5916-3c77-44b9-ac12-04456df23eae",
      "consumer": {
        "type": "cloud-foundry-application",
        "value": "d98b5916-3c77-44b9-ac12-045678edabae"
      },
      "resource_id": "sample-resource",
      "plan_id": "sample-plan",
      "resource_instance_id": "d98b5916-3c77-44b9-ac12-04d61c7a4eae",
      "metrics": [
        {
          "unit": "GIGABYTE",
          "quantity": 10
        },
        {
          "unit": "API_CALL",
          "quantity": 10
        }
      ]
    }
  ]
}
```

### JSON Schema:
```json
{
  "type": "object",
  "required": [
    "usage"
  ],
  "properties": {
    "usage": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "start",
          "end",
          "organization_id",
          "space_id",
          "resource_id",
          "plan_id",
          "resource_instance_id",
          "metrics"
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
          "region": {
            "type": "string"
          },
          "organization_id": {
            "type": "string"
          },
          "space_id": {
            "type": "string"
          },
          "consumer": {
            "type": "object",
            "required": [
              "value"
            ],
            "properties": {
              "type": {
                "enum": [
                  "cloud_foundry_application",
                  "external"
                ],
                "default": "cloud_foundry_application"
              },
              "value": {
                "type": "string"
              }
            },
            "additionalProperties": false
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
          "metrics": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": [
                "unit",
                "quantity"
              ],
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
  "additionalProperties": false,
  "title": "Resource Usage",
  "description": "Usage data for resource instances"
}
```

Cloud resource definitions
---

Cloud resource definition documents are used to configure the types of metrics, units, metering, aggregation and rating formulas used by Abacus to meter and rate usage for each type of Cloud resource.

Cloud resource definition documents are currently provided as [JSON configuration files](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/config/resource/src/resources), but a simple REST API could also be defined for them.

### JSON representation:
```json
{
  "id":"8e9f8a35-dc03-4192-8bba-a77ae60222eb",
  "metrics": [
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
  "transforms": [
    {
      "id": "GB_PER_MONTH",
      "unit": "GIGABYTE",
      "aggregationGroup": {
        "name": "monthly"
      },
      "meter": "AVG({GIGABYTE})"
    },
    {
      "id": "API_CALLS_PER_MONTH",
      "unit": "API_CALL",
      "aggregationGroup": {
        "name": "monthly"
      },
      "meter": "SUM({API_CALL})"
    }
  ]
}
```

### JSON Schema:
```json
{
  "type": "object",
  "required": [
    "id",
    "metrics",
    "transforms"
  ],
  "properties": {
    "id": {
      "type": "string"
    },
    "metrics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "units"
        ],
        "properties": {
          "name": {
            "type": "string"
          },
          "units": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": [
                "name",
                "quantityType"
              ],
              "properties": {
                "name": {
                  "type": "string"
                },
                "quantityType": {
                  "enum": [
                    "DELTA",
                    "CURRENT"
                  ]
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
    "transforms": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": [
          "id",
          "unit",
          "meter"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "unit": {
            "type": "string"
          },
          "aggregationGroup": {
            "type": "object",
            "required": [
              "name"
            ],
            "properties": {
              "name": {
                "enum": [
                  "daily",
                  "monthly"
                ]
              }
            },
            "additionalProperties": false
          },
          "meter": {},
          "accumulate": {},
          "aggregate": {},
          "rate": {}
        },
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties": false,
  "title": "Resource Definition",
  "description": "Defines the metrics, units, metering, accumulation" +
    "aggregation and rating formulas used to meter a particular resource"
}
```

_TODO Update the following APIs_
---

Usage summary
---

The _usage summary_ API is used to retrieve usage summary documents from Abacus.

### Method: get
_HTTP request_: GET /v1/accounts/:account\_id/usage\_summary

_Description_: Retrieves a usage summary for the specified account. An account is defined by Abacus as a collection of organizations managed by a single billing entity.

_HTTP response_: 200 to indicate success with a _usage summary_ JSON document, 404 if the usage is not found, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/organizations/:organization\_id/usage\_summary

_Description_: Retrieves a usage summary for the specified organization.

_HTTP response_: 200 to indicate success with a _usage summary_ JSON document, 404 if the usage is not found, 500 to report a server error.

### Method: get
_HTTP request_: GET /v1/organizations/:organization\_ids\_array/usage\_summary

_Description_: Retrieves a usage summary for the specified organizations.

_HTTP response_: 200 to indicate success with a _usage summary_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON representation:
```json
{
  "summary":[
    {
      "billable_usage":
      {
        "services_cost": 847.8870967741937,
        "support":
        {
          "type": "",
          "cost": 0
        },
        "subscription":
        {
          "cost": 0
        },
        "runtime_cost": 0
      },
      "organizations":[
        {
          "region": "us-south",
          "id": "2b5ab364-b02f-4119-86f8-9e0b95143c77",
          "billable_usage":
          {
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

The _usage report_ API is used to retrieve usage report documents from Abacus.

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

### JSON representation:
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

