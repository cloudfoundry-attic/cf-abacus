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

A _resource usage document_ contains usage measurements for one or more Cloud resources.

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

Resource configuration
---

The _resource configuration_ API is used by Abacus to retrieve _resource configuration_ documents for Cloud resources.

_Resource configuration_ documents describe the types of measurements, metrics, units, and metering, aggregation, rating and reporting formulas that must be used by Abacus to meter, rate, and report usage for each type of Cloud resource.

This API defines the contract between Abacus and the Cloud platform integrating it. The Cloud platform can manage and store _resource configuration_ documents describing its Cloud resources in a platform specific way outside of Abacus, and is simply expected to make these documents available to Abacus at an API endpoint supporting a GET method.

### Method: get
_HTTP request_:
```
GET /v1/provisioning/resources/:resource_id/config/:time
```

_Description_: Retrieves the configuration of the specified Cloud resource effective at the specified time.

_HTTP response_: 200 to indicate success with the requested _resource configuration_ document, 404 if the configuration is not found, 500 to report a server error.

### JSON representation:
```json
{
  "resource_id": "object-storage",
  "effective": 1420070400000,
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
      "rate": "(p, qty) => p ? p * qty : 0",
      "summarize": "(t, qty) => qty",
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
    "resource_id",
    "effective",
    "measures",
    "metrics"
  ],
  "properties": {
    "resource_id": {
      "type": "string"
    },
    "effective": {
      "type": "integer",
      "format": "utc-millisec"
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
          },
          "summarize": {
            "type": "string"
          },
          "charge": {
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

Resource pricing
---

The _resource pricing_ API is used by Abacus to retrieve _resource pricing_ data for Cloud resources.

_Resource pricing_ documents are used to configure the prices of the metrics used to meter Cloud resources. Different prices can be defined for different countries.

This API defines the contract between Abacus and the Cloud platform integrating it. The Cloud platform can manage and store _resource pricing_ data for its Cloud resources in a platform specific way outside of Abacus, and is simply expected to make the pricing data available to Abacus at an API endpoint supporting a GET method.

### Method: get
_HTTP request_:
```
GET /v1/pricing/resources/:resource_id/config/:time
```

_Description_: Retrieves the pricing of the specified Cloud resource effective at the specified time.

_HTTP response_: 200 to indicate success with the requested _resource pricing_ data, 404 if the pricing data is not found, 500 to report a server error.

### JSON representation:
```json
{
  "resource_id": "object-storage",
  "effective": 1420070400000,
  "plans": [
    {
      "plan_id": "basic",
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
          "name": "thousand_light_api_calls",
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
        },
        {
          "name": "heavy_api_calls",
          "prices": [
            {
              "country": "USA",
              "price": 0.15
            },
            {
              "country": "EUR",
              "price": 0.1129
            },
            {
              "country": "CAN",
              "price": 0.1585
            }
          ]
        }
      ]
    },
    {
      "plan_id": "standard",
      "metrics": [
        {
          "name": "storage",
          "prices": [
            {
              "country": "USA",
              "price": 0.5
            },
            {
              "country": "EUR",
              "price": 0.45
            },
            {
              "country": "CAN",
              "price": 0.65
            }
          ]
        },
        {
          "name": "thousand_light_api_calls",
          "prices": [
            {
              "country": "USA",
              "price": 0.04
            },
            {
              "country": "EUR",
              "price": 0.04
            },
            {
              "country": "CAN",
              "price": 0.05
            }
          ]
        },
        {
          "name": "heavy_api_calls",
          "prices": [
            {
              "country": "USA",
              "price": 0.18
            },
            {
              "country": "EUR",
              "price": 0.16
            },
            {
              "country": "CAN",
              "price": 0.24
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
  "title": "priceConfig",
  "type": "object",
  "properties": {
    "resource_id": {
      "type": "string"
    },
    "effective": {
      "type": "integer",
      "format": "utc-millisec"
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
      },
      "additionalItems": false
    }
  },
  "required": [
    "resource_id",
    "effective",
    "plans"
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
  "organization_id": "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
  "start": 1435622400000,
  "end": 1435708799999,
  "charge": 46.09,
  "id": "k-a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27-t-0001435622400000",
  "spaces": [
    {
      "space_id": "aaeae239-f3f8-483c-9dd0-de5d41c38b6a",
      "charge": 46.09,
      "consumers": [
        {
          "consumer_id": "d98b5916-3c77-44b9-ac12-045678edabae",
          "charge": 46.09,
          "resources": [
            {
              "resource_id": "object-storage",
              "charge": 46.09,
              "aggregated_usage": [
                {
                  "metric": "storage",
                  "quantity": 1,
                  "summary": 1,
                  "charge": 1
                },
                {
                  "metric": "thousand_light_api_calls",
                  "quantity": 3,
                  "summary": 3,
                  "charge": 0.09
                },
                {
                  "metric": "heavy_api_calls",
                  "quantity": 300,
                  "summary": 300,
                  "charge": 45
                }
              ],
              "plans": [
                {
                  "plan_id": "basic",
                  "charge": 46.09,
                  "aggregated_usage": [
                    {
                      "metric": "storage",
                      "quantity": 1,
                      "summary": 1,
                      "cost": 1,
                      "charge": 1
                    },
                    {
                      "metric": "thousand_light_api_calls",
                      "quantity": 3,
                      "summary": 3,
                      "cost": 0.09,
                      "charge": 0.09
                    },
                    {
                      "metric": "heavy_api_calls",
                      "quantity": 300,
                      "summary": 300,
                      "cost": 45,
                      "charge": 45
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
          "charge": 46.09,
          "aggregated_usage": [
            {
              "metric": "storage",
              "quantity": 1,
              "summary": 1,
              "charge": 1
            },
            {
              "metric": "thousand_light_api_calls",
              "quantity": 3,
              "summary": 3,
              "charge": 0.09
            },
            {
              "metric": "heavy_api_calls",
              "quantity": 300,
              "summary": 300,
              "charge": 45
            }
          ],
          "plans": [
            {
              "plan_id": "basic",
              "charge": 46.09,
              "aggregated_usage": [
                {
                  "metric": "storage",
                  "quantity": 1,
                  "summary": 1,
                  "cost": 1,
                  "charge": 1
                },
                {
                  "metric": "thousand_light_api_calls",
                  "quantity": 3,
                  "summary": 3,
                  "cost": 0.09,
                  "charge": 0.09
                },
                {
                  "metric": "heavy_api_calls",
                  "quantity": 300,
                  "summary": 300,
                  "cost": 45,
                  "charge": 45
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
      "charge": 46.09,
      "aggregated_usage": [
        {
          "metric": "storage",
          "quantity": 1,
          "summary": 1,
          "charge": 1
        },
        {
          "metric": "thousand_light_api_calls",
          "quantity": 3,
          "summary": 3,
          "charge": 0.09
        },
        {
          "metric": "heavy_api_calls",
          "quantity": 300,
          "summary": 300,
          "charge": 45
        }
      ],
      "plans": [
        {
          "plan_id": "basic",
          "charge": 46.09,
          "aggregated_usage": [
            {
              "metric": "storage",
              "quantity": 1,
              "summary": 1,
              "cost": 1,
              "charge": 1
            },
            {
              "metric": "thousand_light_api_calls",
              "quantity": 3,
              "summary": 3,
              "cost": 0.09,
              "charge": 0.09
            },
            {
              "metric": "heavy_api_calls",
              "quantity": 300,
              "summary": 300,
              "cost": 45,
              "charge": 45
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
    "charge": {
      "type": "number"
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
          "charge": {
            "type": "number"
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
                "metric",
                "quantity",
                "summary",
                "charge"
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
                "charge": {
                  "type": "number"
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
                      "metric",
                      "quantity",
                      "summary",
                      "cost",
                      "charge"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "plan_id",
                "charge",
                "aggregated_usage"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "required": [
          "resource_id",
          "charge",
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
          "charge": {
            "type": "number"
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
                "charge": {
                  "type": "number"
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
                      "metric",
                      "quantity",
                      "summary",
                      "charge"
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
                      "charge": {
                        "type": "number"
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
                            "metric",
                            "quantity",
                            "summary",
                            "cost",
                            "charge"
                          ],
                          "additionalProperties": false
                        },
                        "additionalItems": false
                      }
                    },
                    "required": [
                      "plan_id",
                      "charge",
                      "aggregated_usage"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "resource_id",
                "charge",
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
                "consumer": {
                  "title": "consumer",
                  "type": "object",
                  "properties": {
                    "type": {
                      "title": "consumerType",
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
                "charge": {
                  "type": "number"
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
                      "charge": {
                        "type": "number"
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
                            "metric",
                            "quantity",
                            "summary",
                            "charge"
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
                            "charge": {
                              "type": "number"
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
                                  "metric",
                                  "quantity",
                                  "summary",
                                  "cost",
                                  "charge"
                                ],
                                "additionalProperties": false
                              },
                              "additionalItems": false
                            }
                          },
                          "required": [
                            "plan_id",
                            "charge",
                            "aggregated_usage"
                          ],
                          "additionalProperties": false
                        },
                        "additionalItems": false
                      }
                    },
                    "required": [
                      "resource_id",
                      "charge",
                      "aggregated_usage",
                      "plans"
                    ],
                    "additionalProperties": false
                  },
                  "additionalItems": false
                }
              },
              "required": [
                "consumer",
                "charge",
                "resources"
              ],
              "additionalProperties": false
            },
            "additionalItems": false
          }
        },
        "required": [
          "space_id",
          "charge",
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
    "charge",
    "resources",
    "spaces"
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
    organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      resources {
        resource_id,
        aggregated_usage {
          metric,
          quantity
        }
      }
    }
}

{
  organization(
    organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      spaces {
        space_id,
        resources {
          resource_id,
          aggregated_usage {
            metric,
            quantity
          }
        }
      }
    }
}

{
  organization(
    organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
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
              quantity
            }
          }
        }
      }
    }
}

{
  organization(
    organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
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
    organization_id: "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
    time: 1435622400000) {
      organization_id,
      resources {
        resource_id,
        aggregated_usage {
          metric,
          quantity
        }
      }
    }
}

{
  organizations(
    organization_ids: [
      "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",                                      
      "b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28"],
    time: 1435622400000) {
      organization_id,
      resources {
        resource_id,
        aggregated_usage {
          metric,
          quantity
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
          quantity
        }
      }
    }
}
```

### GraphQL schema:
```graphql
type PlanMetric {
  metric: String
  quantity: Float
  cost: Float
  summary: Float
  charge: Float
}

type Plan {
  plan_id: String
  charge: Float
  aggregated_usage: [PlanMetric]
}

type ResourceMetric {
  metric: String
  quantity: Float
  summary: Float
  charge: Float
}

type Resource {
  resource_id: String
  charge: Float
  aggregated_usage: [ResourceMetric]
  plans: [Plan]
}

enum ConsumerType { 'CF_APP', 'EXTERNAL' }

type ConsumerID = {
  type: ConsumerType
  consumer_id: String
}

type Consumer {
  consumer: ConsumerID
  charge: Float
  resources: [Resource]
}

type Space {
  space_id: String
  charge: Float
  resources: [Resource]
  consumers: [Consumer]
}

type OrganizationReport {
  id: String
  organization_id: String
  start: Int
  end: Int
  charge: Float
  resources: [Resource]
  spaces: [Space]
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

