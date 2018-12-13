'use strict';

const aggregatesInitialUsageExpected = [
  {
    'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'resources': [
      {
        'resource_id': 'test-resource',
        'plans': [
          {
            'plan_id': 'basic/test-metering-plan/test-rating-plan/test-pricing-basic',
            'aggregated_usage': [
              {
                'metric': 'heavy_api_calls',
                'windows': [
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    {
                      'quantity': 12,
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': 12,
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              },
              {
                'metric': 'memory',
                'windows': [
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    {
                      'quantity': {
                        'consuming': 6,
                        'consumed': 518400000
                      },
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': {
                        'consuming': 6,
                        'consumed': 13996800000
                      },
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              }
            ],
            'metering_plan_id': 'test-metering-plan',
            'rating_plan_id': 'test-rating-plan',
            'pricing_plan_id': 'test-pricing-basic'
          }
        ]
      }
    ],
    'spaces': [
      {
        'space_id': 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        't': '0001446292800000-0-0-0-0'
      }
    ],
    'account_id': '1234',
    'start': 1446249600000,
    'end': 1446251400000,
    'resource_instance_id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
    'consumer_id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    'resource_id': 'test-resource',
    'plan_id': 'basic',
    'processed': 1446292800000,
    'accumulated_usage_id': 't/0001446292800000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/t/0001446292800000-0-0-0-0',
    'processed_id': '0001446292800000'
  },
  {
    'consumer_id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    'resources': [
      {
        'resource_id': 'test-resource',
        'plans': [
          {
            'plan_id': 'basic/test-metering-plan/test-rating-plan/test-pricing-basic',
            'aggregated_usage': [
              {
                'metric': 'heavy_api_calls',
                'windows': [
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    {
                      'quantity': 12,
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': 12,
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              },
              {
                'metric': 'memory',
                'windows': [
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    {
                      'quantity': {
                        'consuming': 6,
                        'consumed': 518400000
                      },
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': {
                        'consuming': 6,
                        'consumed': 13996800000
                      },
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              }
            ],
            'resource_instances': [
              {
                'id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
                't': '0001446251400001',
                'p': 1446251400001
              }
            ],
            'metering_plan_id': 'test-metering-plan',
            'rating_plan_id': 'test-rating-plan',
            'pricing_plan_id': 'test-pricing-basic'
          }
        ]
      }
    ],
    'start': 1446249600000,
    'end': 1446251400000,
    'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'resource_instance_id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
    'resource_id': 'test-resource',
    'plan_id': 'basic',
    'processed': 1446292800000,
    'accumulated_usage_id': 't/0001446292800000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/' + 
      'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/t/0001446292800000-0-0-0-0',
    'processed_id': '0001446292800000'
  },
  {
    'space_id': 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    'consumers': [
      {
        'id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        't': '0001446292800000-0-0-0-0'
      }
    ],
    'resources': [
      {
        'resource_id': 'test-resource',
        'plans': [
          {
            'plan_id': 'basic/test-metering-plan/test-rating-plan/test-pricing-basic',
            'aggregated_usage': [
              {
                'metric': 'heavy_api_calls',
                'windows': [
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    {
                      'quantity': 12,
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': 12,
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              },
              {
                'metric': 'memory',
                'windows': [
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    null
                  ],
                  [
                    {
                      'quantity': {
                        'consuming': 6,
                        'consumed': 518400000
                      },
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': {
                        'consuming': 6,
                        'consumed': 13996800000
                      },
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              }
            ],
            'metering_plan_id': 'test-metering-plan',
            'rating_plan_id': 'test-rating-plan',
            'pricing_plan_id': 'test-pricing-basic'
          }
        ]
      }
    ],
    'start': 1446249600000,
    'end': 1446251400000,
    'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'processed': 1446292800000,
    'accumulated_usage_id': 't/0001446292800000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/t/0001446292800000-0-0-0-0',
    'processed_id': '0001446292800000'
  },
  {
    'processed': 1446292800000,
    'accumulated_usage_id': 't/0001446292800000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/0b39fa70-a65f-4183-bae8-385633ca5c87/' + 
      'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/basic/test-metering-plan/test-rating-plan/test-pricing-basic/' + 
      't/0001446251400000/0001446249600000',
    'processed_id': '0001446292800000'
  }
];

module.exports = {
  aggregatesInitialUsageExpected
};
