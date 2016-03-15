<!--
Abacus Metering and Aggregation REST API
-->
Abacusメータリング＆集計REST API
===

<!--
The Abacus Usage Metering and Aggregation REST API can be used by Cloud resource providers to submit usage data, usage dashboards to retrieve real time usage reports, and billing systems to retrieve the aggregated and rated usage data needed for billing. Cloud resources include services and application runtimes or containers for example.
-->
Abacus利用量メータリングと集計のREST APIは、クラウドリソースプロバイダによる利用量の登録や、リアルタイムにレポートされる利用量ダッシュボード、請求のために料金として集計・計算するための課金システムによって利用されます。例えば、クラウドリソースにはサービス、およびアプリケーションランタイムやコンテナなどが含まれます。

<!--
Usage data is exchanged with Abacus in the form of usage documents. Each document type has a JSON representation and one or more REST methods.
-->
利用量はAbacusによって利用量ドキュメントの形式に変換されます。それぞれのドキュメントタイプはJSON形式と１つ以上のREST関数を持ちます。

<!--
Document types
-->
ドキュメントタイプ
---

<!--
Resource usage collection
-->
リソース利用量集計

<!--
Resource configuration
-->
リソース設定

<!--
Resource pricing
-->
リソース単価

<!--
Usage summary report
-->
利用量サマリレポート

<!--
GraphQL usage query
-->
GraphQL利用量クエリ

<!--
Resource usage
-->
リソース利用量
---

<!--
The _resource usage collection_ API can be used by Cloud resource providers to submit usage for instances of Cloud resources, including service instances and application runtimes or containers.
-->
_リソース利用量集計_ APIはクラウドリソースプロバイダがクラウドリソースのインスタンス利用量を登録する場合に利用します。クラウドリソースはサービスインスタンスと、アプリケーションランタイム、もしくはコンテナを含みます。

<!--
Usage can be submitted by POSTing _resource usage_ documents to Abacus.
-->
利用量は_リソース利用量_ドキュメントをAbacusにPOSTすることで登録できます。

<!--
A _resource usage document_ contains usage measurements for one or more Cloud resources.
-->
_リソース利用量ドキュメント_には、1つ以上のクラウドリソースによって計測された利用量が含まれます。

<!--
Once a _resource usage_ document has been submitted to Abacus it can be retrieved using GET.
-->
一度_リソース利用量_ドキュメントがAbacusに登録されると、GETメソッドによって取り出すことが可能となります。

### Method: insert
_HTTP request_:
```
POST /v1/metering/collected/usage with a resource usage document
```

<!--
_Description_: Records the _resource usage_ document and processes the Cloud resource usage data it contains.
-->
_説明_: _リソース利用量_ドキュメントを記録し、そこに含まれているクラウドリソース利用量を処理します。

<!--
_HTTP response_: 201 to indicate success with the URL of the _resource usage_ document in a Location header, 400 to report an invalid request, 500 to report a server error.
-->
_HTTPレスポンス_: 成功した場合、Locationヘッダに_リソース利用量_ドキュメントのURLが設定されて201で返ります。リクエストが不正な場合は400、サーバでエラーが発生した場合は500が返ります。

### Method: get
_HTTP request_:
```
GET /v1/metering/collected/usage/:usage_document_id
```

<!--
_Description_: Retrieves a previously submitted _resource usage_ document.
-->
_説明_: 以前に登録された_リソース利用量_ドキュメントを取得します。

<!--
_HTTP response_: 200 to indicate success with the requested _resource usage_ document, 404 if the usage is not found, 500 to report a server error.
-->
_HTTPレスポンス_: _リソース利用量_ドキュメントが200で返ります。利用量が見つからない場合は404、サーバでエラーが発生した場合は500が返ります。


<!--
### JSON representation:
-->
### JSON形式
```json
{
  "usage": [
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
  ]
}
```

<!--
### JSON schema:
-->
### JSONスキーマ
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
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties": false,
  "title": "Resource Usage"
}
```

<!--
Resource configuration
-->
リソース設定
---

<!--
The _resource configuration_ API is used by Abacus to retrieve _resource configuration_ documents for Cloud resources.
-->
_リソース設定_ APIはクラウドリソースの_リソース設定_ドキュメントを取得するためにAbacusによって利用されます。

<!--
_Resource configuration_ documents describe the types of measurements, metrics, units, and metering, aggregation, rating and reporting formulas that must be used by Abacus to meter, rate, and report usage for each type of Cloud resource.
-->
_リソース設定_ドキュメントには、計測・メトリクス・単位そしてメータリング・集計・金額計算とレポート形式のタイプが記載されます。
これらはAbacusがメータリングし、金額を計算し、クラウドリソース毎に利用量レポートを作成するために必要なものです。

<!--
This API defines the contract between Abacus and the Cloud platform integrating it. The Cloud platform can manage and store _resource configuration_ documents describing its Cloud resources in a platform specific way outside of Abacus, and is simply expected to make these documents available to Abacus at an API endpoint supporting a GET method.
-->
このAPIはAbacusとクラウドプラットフォーム間の契約を定義します。クラウドプラットフォームは、Abacusが関与しない方法で決められたクラウドリソースが記載されている_リソース設定_ドキュメントを管理することができます。また、GETメソッドがサポートされているAbacusのAPIエンドポイントをによって、これらのドキュメントを簡単に有効化することが出来ます。

### Method: get
_HTTP request_:
```
GET /v1/provisioning/resources/:resource_id/config/:time
```

<!--
_Description_: Retrieves the configuration of the specified Cloud resource effective at the specified time.
-->
_説明_: 指定された時間の、指定された有効なクラウドリソースの設定を取得します。

<!--
_HTTP response_: 200 to indicate success with the requested _resource configuration_ document, 404 if the configuration is not found, 500 to report a server error.
-->
_HTTPレスポンス_: 要求された_リソース設定_ドキュメントが200で返ります。設定が見つからない場合は404、サーバでエラーが発生した場合は500が返ります。


<!--
### JSON representation:
-->
### JSON形式
```json
{
  "resource_id": "object-storage",
  "effective": 1420070400000,
  "plans": [
    {
      "plan_id": "basic",
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
    },
    {
      "plan_id": "standard",
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
  ]
}
```

<!--
### JSON schema:
-->
### JSONスキーマ
```json
{
  "type": "object",
  "required": [
    "resource_id",
    "effective"
  ],
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
        "additionalProperties": false
      },
      "additionalItems": false
    }
  },
  "additionalProperties": false,
  "title": "Resource Definition"
}
```

<!--
Resource pricing
-->
リソース単価
---

<!--
The _resource pricing_ API is used by Abacus to retrieve _resource pricing_ data for Cloud resources.
-->
_リソース単価_ APIは、Abacusがクラウドリソースに対する_リソース単価_データを取得するときに利用します。

<!--
_Resource pricing_ documents are used to configure the prices of the metrics used to meter Cloud resources. Different prices can be defined for different countries.
-->
_リソース単価_ドキュメントは、クラウドリソースで計測されたメトリクスの単価を設定するために使われます。異なる国ごとに異なる単価を設定することができます。

<!--
This API defines the contract between Abacus and the Cloud platform integrating it. The Cloud platform can manage and store _resource pricing_ data for its Cloud resources in a platform specific way outside of Abacus, and is simply expected to make the pricing data available to Abacus at an API endpoint supporting a GET method.
-->
このAPIはAbacusとクラウドプラットフォーム間の契約を定義します。クラウドプラットフォームは、Abacusが関与しない方法で決められたクラウドリソースの_リソース単価_データを管理・登録することができます。また、GETメソッドがサポートされているAbacusのAPIエンドポイントをによって、これらの単価データを簡単に有効化することが出来ます。

### Method: get
_HTTP request_:
```
GET /v1/pricing/resources/:resource_id/config/:time
```

<!--
_Description_: Retrieves the pricing of the specified Cloud resource effective at the specified time.
-->
_説明_: 指定された時間の、指定された有効なクラウドリソースの単価を取得します。

<!--
_HTTP response_: 200 to indicate success with the requested _resource pricing_ data, 404 if the pricing data is not found, 500 to report a server error.
-->
_HTTPレスポンス_: 要求された_リソース単価_ドキュメントが200で返ります。単価データが見つからない場合は404、サーバでエラーが発生した場合は500が返ります。

<!--
### JSON representation:
-->
### JSON形式
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

<!--
### JSON schema:
-->
### JSONスキーマ
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

<!--
Usage summary report
-->
利用量サマリレポート
---

<!--
The _usage summary report_ API can be used to retrieve aggregated usage summary report documents from Abacus.
-->
_利用量サマリサポート_ APIは集計された利用量のサマリレポートドキュメントをAbacusから取得する場合に利用します。

### Method: get
_HTTP request_:
```
GET /v1/metering/organizations/:organization_id/aggregated/usage/:time
```

<!--
_Description_: Retrieves a usage report document containing a summary of the aggregated Cloud resource usage incurred by the specified organization at the specified time.
-->
_説明_: 指定された時間の、指定された組織に対応した、クラウドリソース使用量の集計結果のサマリを含む、利用量レポートドキュメントを取得します。

<!--
_HTTP response_: 200 to indicate success with a _usage summary report_ JSON document, 404 if the usage is not found, 500 to report a server error.
-->
_HTTPレスポンス_: _利用量サマリレポート_のJSONドキュメントが200で返ります。利用量が見つからない場合は404、サーバでエラーが発生した場合は500が返ります。


<!--
### JSON representation:
-->
### JSON形式
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

<!--
### JSON schema:
-->
### JSONスキーマ
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

<!--
GraphQL usage query
-->
GraphQL利用量クエリ
---

<!--
The _GraphQL usage query_ API can be used to query aggregated usage using the [GraphQL](https://github.com/facebook/graphql) query language.
-->
_GraphQL利用量クエリ_APIは[GraphQL](https://github.com/facebook/graphql)クエリ言語を用いて利用量を集める場合に利用します。

<!--
Abacus defines a GraphQL schema for aggregated usage, allowing users to navigate and query the graph of aggregated usage within organizations and the spaces and resources they contain using the [GraphQL](https://github.com/facebook/graphql) query language.
-->
Abacusでは利用量集計のGraphQLスキーマを定義しています。[GraphQL](https://github.com/facebook/graphql)クエリ言語を利用することで、組織とスペース、リソースに含まれている利用量を集計したグラフを問い合わせることができます。

<!--
The GraphQL schema listed below describes the graph used to represent aggregated usage, as well as the supported usage queries.
-->
下記のGraphQLスキーマでは、サポートされている利用量のクエリはもちろん、利用量の集計に関する代表的なグラフを表現しています。


<!--
See the [GraphQL](https://github.com/facebook/graphql) documentation for more information on the GraphQL schema and query languages.
-->
GraphQLスキーマとクエリ言語に関する詳細な情報は、[GraphQL](https://github.com/facebook/graphql)ドキュメントを参照してください。



### Method: get
_HTTP request_:
```
GET /v1/metering/aggregated/usage/graph/:query
```

<!--
_Description_: Retrieves a usage report document containing a summary of the Cloud resource usage matching the specified GraphQL query.
-->
_説明_: 指定されたGraphQLクエリにマッチするクラウドリソース利用量のサマリを含む、利用量レポートドキュメントを取得します。


<!--
_HTTP response_: 200 to indicate success with a _usage summary report_ JSON document, 404 if the usage is not found, 500 to report a server error.
-->
_HTTPレスポンス_: 成功した場合、_利用量サマリサポート_のJSONドキュメントが200で返ります。利用量が見つからない場合は404、サーバでエラーが発生した場合は500が返ります。


<!--
### Example GraphQL queries:
-->
### GraphQLクエリのサンプル:

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
          quantity
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
          quantity
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

<!--
### GraphQL schema:
-->
### GraphQLスキーマ:

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

