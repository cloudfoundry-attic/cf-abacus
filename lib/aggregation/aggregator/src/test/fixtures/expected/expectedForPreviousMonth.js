'use strict';

const {
  testResourceID, testOrganizationID, testSpaceID, testConsumerID, testPlanID,
  testAccountID, testMeteringPlanID, testRatingPlanID, testPricingPlanID, testResourceInstanceIDs, times
} = require('../usageDocumentFieldsConstants');

const november = [
  {
    'organization_id': testOrganizationID,
    'resources': [
      {
        'resource_id': testResourceID,
        'plans': [
          {
            'plan_id': `${testPlanID}/${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}`,
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
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'spaces': [
      {
        'space_id': testSpaceID,
        't': '0001446415200000-0-0-0-0'
      }
    ],
    'account_id': testAccountID,
    'start': 1446350400000,
    'end': 1446350400001,
    'resource_instance_id': testResourceInstanceIDs[0],
    'consumer_id': testConsumerID,
    'resource_id': testResourceID,
    'plan_id': testPlanID,
    'processed': 1446415200000,
    'accumulated_usage_id': `t/0001446415200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/t/0001446415200000-0-0-0-0`,
    'processed_id': '0001446415200000'
  },
  {
    'consumer_id': testConsumerID,
    'resources': [
      {
        'resource_id': testResourceID,
        'plans': [
          {
            'plan_id': `${testPlanID}/${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}`,
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
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              }
            ],
            'resource_instances': [
              {
                'id': testResourceInstanceIDs[0],
                't': '0001446350400002',
                'p': 1446350400002
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'start': 1446350400000,
    'end': 1446350400001,
    'organization_id': testOrganizationID,
    'resource_instance_id': testResourceInstanceIDs[0],
    'resource_id': testResourceID,
    'plan_id': testPlanID,
    'processed': 1446415200000,
    'accumulated_usage_id': `t/0001446415200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/${testConsumerID}/t/0001446415200000-0-0-0-0`,
    'processed_id': '0001446415200000'
  },
  {
    'space_id': testSpaceID,
    'consumers': [
      {
        'id': testConsumerID,
        't': '0001446415200000-0-0-0-0'
      }
    ],
    'resources': [
      {
        'resource_id': testResourceID,
        'plans': [
          {
            'plan_id': `${testPlanID}/${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}`,
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
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null
                  ]
                ]
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'start': 1446350400000,
    'end': 1446350400001,
    'organization_id': testOrganizationID,
    'processed': 1446415200000,
    'accumulated_usage_id': `t/0001446415200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/t/0001446415200000-0-0-0-0`,
    'processed_id': '0001446415200000'
  },
  {
    'processed': 1446415200000,
    'accumulated_usage_id': `t/0001446415200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testResourceInstanceIDs[0]}/${testConsumerID}/basic/${testMeteringPlanID}/` +
     `${testRatingPlanID}/${testPricingPlanID}/t/0001446350400001/0001446350400000`,
    'processed_id': '0001446415200000'
  }
];

const generateDoc = (quantity, startTime, endTime, processedTime, endOfMonthTime = '') => [
  {
    'organization_id': testOrganizationID,
    'resources': [
      {
        'resource_id': testResourceID,
        'plans': [
          {
            'plan_id': `${testPlanID}/${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}`,
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
                      'quantity': quantity.current,
                      'previous_quantity': quantity.previous
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': quantity.current,
                      'previous_quantity': quantity.previous
                    },
                    null
                  ]
                ]
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'spaces': [
      {
        'space_id': testSpaceID,
        't': `${endOfMonthTime}000${processedTime}-0-0-0-0`
      }
    ],
    'account_id': testAccountID,
    'start': startTime,
    'end': endTime,
    'resource_instance_id': testResourceInstanceIDs[0],
    'consumer_id': testConsumerID,
    'resource_id': testResourceID,
    'plan_id': testPlanID,
    'processed': processedTime,
    'accumulated_usage_id': `t/${endOfMonthTime}000${processedTime}-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/t/${endOfMonthTime}000${processedTime}-0-0-0-0`,
    'processed_id': `000${processedTime}`
  },
  {
    'consumer_id': testConsumerID,
    'resources': [
      {
        'resource_id': testResourceID,
        'plans': [
          {
            'plan_id': `${testPlanID}/${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}`,
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
                      'quantity': quantity.current,
                      'previous_quantity': quantity.previous
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': quantity.current,
                      'previous_quantity': quantity.previous
                    },
                    null
                  ]
                ]
              }
            ],
            'resource_instances': [
              {
                'id': testResourceInstanceIDs[0],
                't': `000${endTime + 1}`,
                'p': endTime + 1
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'start': startTime,
    'end': endTime,
    'organization_id': testOrganizationID,
    'resource_instance_id': testResourceInstanceIDs[0],
    'resource_id': testResourceID,
    'plan_id': testPlanID,
    'processed': processedTime,
    'accumulated_usage_id': `t/${endOfMonthTime}000${processedTime}-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/${testConsumerID}/t/${endOfMonthTime}000${processedTime}-0-0-0-0`,
    'processed_id': `000${processedTime}`
  },
  {
    'space_id': testSpaceID,
    'consumers': [
      {
        'id': testConsumerID,
        't': `${endOfMonthTime}000${processedTime}-0-0-0-0`
      }
    ],
    'resources': [
      {
        'resource_id': testResourceID,
        'plans': [
          {
            'plan_id': `${testPlanID}/${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}`,
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
                      'quantity': quantity.current,
                      'previous_quantity': quantity.previous
                    },
                    null,
                    null
                  ],
                  [
                    {
                      'quantity': quantity.current,
                      'previous_quantity': quantity.previous
                    },
                    null
                  ]
                ]
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'start': startTime,
    'end': endTime,
    'organization_id': testOrganizationID,
    'processed': processedTime,
    'accumulated_usage_id': `t/${endOfMonthTime}000${processedTime}-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/t/${endOfMonthTime}000${processedTime}-0-0-0-0`,
    'processed_id': `000${processedTime}`
  },
  {
    'processed': processedTime,
    'accumulated_usage_id': `t/${endOfMonthTime}000${processedTime}-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testResourceInstanceIDs[0]}/${testConsumerID}/basic/${testMeteringPlanID}/` +
     `${testRatingPlanID}/${testPricingPlanID}/t/000${endTime}/000${startTime}`,
    'processed_id': `000${processedTime}`
  }
];

const previousMonthExpected = {
  october: {
    firstDoc: generateDoc(
      { current: 12, previous: null },
      times.endOfOctoberTwelveAM, times.endOfOctoberTwelveThirtyAM, times.endOfOctoberTwelvePM),
    secondDoc: generateDoc(
      { current: 22, previous: 12 },
      times.endOfOctoberTwelveThirtyAM, 
      times.endOfOctoberTwelveThirtyAM + 1, 
      times.startOfNovemberTenPM,  
      `000${times.endOfOctober}-`)
  },
  november
};

module.exports = {
  previousMonthExpected
};
