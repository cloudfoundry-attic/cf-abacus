Abacus Metering and Aggregation REST API
===

The Abacus Usage Metering and Aggregation REST API is used by Cloud resource providers to submit usage data, usage dashboards to retrieve real time usage reports, and billing systems to retrieve the aggregated and rated usage data needed for billing. Cloud resources include services and application runtimes or containers for example.

Usage data is exchanged with Abacus in the form of usage documents. Each document type has a JSON representation and one or more REST methods.

Document types
---

Resource usage

Resource configuration

Usage summary report

Detailed usage report

Resource usage
---

The _resource usage_ API is used by Cloud resource providers to submit usage for instances of Cloud resources, including service instances and application runtimes or containers.

Usage can be submitted by POSTing _resource usage_ documents to Abacus.

A _resource usage document_ contains usage measurements for one or more Cloud resources.

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
        "type": "CF_APP",
        "consumer_id": "d98b5916-3c77-44b9-ac12-045678edabae"
      },
      "resource_id": "storage-service",
      "plan_id": "basic-plan",
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
          "measured_usage"
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
              "type", "consumer_id"
            ],
            "properties": {
              "type": {
                "enum": [
                  "CF_APP",
                  "EXTERNAL"
                ],
                "default": "CF_APP"
              },
              "consumer_id": {
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
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties": false,
  "title": "Resource Usage"
}
```

Cloud resource definitions
---

Cloud resource definition documents are used to configure the types of measurements, metrics, units, and metering, aggregation and rating formulas used by Abacus to meter and rate usage for each type of Cloud resource.

Cloud resource definition documents are currently provided as [JSON configuration files](../lib/config/resource/src/resources). A REST API will also be defined to allow resource providers to submit resource definition documents for the resources they provide.

### JSON representation:
```json
{
  "resource_id": "storage-service",
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
      "accumulate": "(a, qty) => Math.max(a, qty)",
      "rate": "(p, qty) => p ? p * qty : 0"
    },
    {
      "name": "thousand_api_calls",
      "unit": "THOUSAND_CALLS",
      "meter": "(m) => m.light_api_calls / 1000",
      "accumulate": "(a, qty) => a ? a + qty : qty",
      "aggregate": "(a, qty) => a ? a + qty : qty",
      "rate": "(p, qty) => p ? p * qty : 0"
    }
  ]
}
```

### JSON Schema:
```json
{
  "type": "object",
  "required": [
    "resource_id",
    "measures",
    "metrics"
  ],
  "properties": {
    "resource_id": {
      "type": "string"
    },
    "measures": {
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
          "unit",
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
          "rate": {
            "type": "string"
          }
        },
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties": false,
  "title": "Resource Definition"
}
```

Usage summary report
---

The _usage summary report_ API is used to retrieve usage summary report documents from Abacus.

### Method: get
_HTTP request_: GET /v1/organizations/:organization_id/usage/:date

_Description_: Retrieves a usage report document containing a summary of the Cloud resource usage incurred by the specified organization on the specified date.

_HTTP response_: 200 to indicate success with a _usage summary report_ JSON document, 404 if the usage is not found, 500 to report a server error.

### JSON representation:
```json
{
  "organization_id": "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
  "start": 1435622400000,
  "end": 1435708799999,
  "cost": 0,
  "id": "k-a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27-t-0001435622400000",
  "spaces": [
    {
      "space_id": "aaeae239-f3f8-483c-9dd0-de5d41c38b6a",
      "cost": 0,
      "consumers": [
        {
          "consumer_id": "d98b5916-3c77-44b9-ac12-045678edabae",
          "cost": 0,
          "resources": [
            {
              "resource_id": "storage-service",
              "cost": 0,
              "aggregated_usage": [
                {
                  "metric": "storage",
                  "quantity": 1,
                  "cost": 0
                },
                {
                  "metric": "thousand_light_api_calls",
                  "quantity": 3,
                  "cost": 0
                },
                {
                  "metric": "heavy_api_calls",
                  "quantity": 300,
                  "cost": 0
                }
              ],
              "plans": [
                {
                  "plan_id": "basic-plan",
                  "cost": 0,
                  "aggregated_usage": [
                    {
                      "metric": "storage",
                      "quantity": 1,
                      "cost": 0
                    },
                    {
                      "metric": "thousand_light_api_calls",
                      "quantity": 3,
                      "cost": 0
                    },
                    {
                      "metric": "heavy_api_calls",
                      "quantity": 300,
                      "cost": 0
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
          "resource_id": "storage-service",
          "cost": 0,
          "aggregated_usage": [
            {
              "metric": "storage",
              "quantity": 1,
              "cost": 0
            },
            {
              "metric": "thousand_light_api_calls",
              "quantity": 3,
              "cost": 0
            },
            {
              "metric": "heavy_api_calls",
              "quantity": 300,
              "cost": 0
            }
          ],
          "plans": [
            {
              "plan_id": "basic-plan",
              "cost": 0,
              "aggregated_usage": [
                {
                  "metric": "storage",
                  "quantity": 1,
                  "cost": 0
                },
                {
                  "metric": "thousand_light_api_calls",
                  "quantity": 3,
                  "cost": 0
                },
                {
                  "metric": "heavy_api_calls",
                  "quantity": 300,
                  "cost": 0
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
      "resource_id": "storage-service",
      "cost": 0,
      "aggregated_usage": [
        {
          "metric": "storage",
          "quantity": 1,
          "cost": 0
        },
        {
          "metric": "thousand_light_api_calls",
          "quantity": 3,
          "cost": 0
        },
        {
          "metric": "heavy_api_calls",
          "quantity": 300,
          "cost": 0
        }
      ],
      "plans": [
        {
          "plan_id": "basic-plan",
          "cost": 0,
          "aggregated_usage": [
            {
              "metric": "storage",
              "quantity": 1,
              "cost": 0
            },
            {
              "metric": "thousand_light_api_calls",
              "quantity": 3,
              "cost": 0
            },
            {
              "metric": "heavy_api_calls",
              "quantity": 300,
              "cost": 0
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
  "type": "object",
  "properties": {
    "id": {
      "type": "string"
    },
    "organization_id": {
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
    "resources": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "resource_id": {
            "type": "string"
          },
          "aggregated_usage": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "properties": {
                "metric": {
                  "type": "string"
                },
                "quantity": {
                  "type": "number"
                },
                "cost": {
                  "type": "number"
                }
              },
              "required": [
                "metric",
                "quantity",
                "cost"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "required": [
          "resource_id",
          "aggregated_usage"
        ],
        "additionalProperties": false
      },
      "additionalItems": false
    },
    "spaces": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "properties": {
          "space_id": {
            "type": "string"
          },
          "resources": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "properties": {
                "resource_id": {
                  "type": "string"
                },
                "aggregated_usage": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "type": "object",
                    "properties": {
                      "metric": {
                        "type": "string"
                      },
                      "quantity": {
                        "type": "number"
                      },
                      "cost": {
                        "type": "number"
                      }
                    },
                    "required": [
                      "metric",
                      "quantity",
                      "cost"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "resource_id",
                "aggregated_usage"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          },
          "consumers": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "properties": {
                "consumer": {
                  "type": "object",
                  "properties": {
                    "type": {
                      "enum": [
                        "CF_APP",
                        "EXTERNAL"
                      ],
                      "default": "CF_APP"
                    },
                    "consumer_id": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "consumer_id"
                  ],
                  "additionalProperties": false
                },
                "resources": {
                  "type": "array",
                  "minItems": 1,
                  "items": {
                    "type": "object",
                    "properties": {
                      "resource_id": {
                        "type": "string"
                      },
                      "aggregated_usage": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                          "type": "object",
                          "properties": {
                            "metric": {
                              "type": "string"
                            },
                            "quantity": {
                              "type": "number"
                            },
                            "cost": {
                              "type": "number"
                            }
                          },
                          "required": [
                            "metric",
                            "quantity",
                            "cost"
                          ],
                          "additionalProperties": false
                        },
                        "additionalItems": false
                      }
                    },
                    "required": [
                      "resource_id",
                      "aggregated_usage"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "consumer",
                "resources"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "required": [
          "space_id",
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
    "resources",
    "spaces"
  ],
  "additionalProperties": false,
  "title": "Usage Summary Report"
}
```

Detailed usage report
---

### TODO

Document how to get detailed usage reports with GraphQL.
...


