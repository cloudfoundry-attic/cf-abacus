'use strict';

const {
  testResourceID, testOrganizationID, testSpaceID, testConsumerID, testPlanID,
  testAccountID, testMeteringPlanID, testRatingPlanID, testPricingPlanID, testResourceInstanceIDs
} = require('../usageDocumentFieldsConstants');


const shiftsMonthWindowsExpected = [
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
                    {
                      'quantity': 12
                    },
                    null
                  ],
                  [
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    {
                      'quantity': 12
                    }
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
        't': '0001446292800000-0-0-0-1'
      }
    ],
    'account_id': testAccountID,
    'start': 1446251400000,
    'end': 1446350400000,
    'resource_instance_id': testResourceInstanceIDs[0],
    'consumer_id': testConsumerID,
    'resource_id': testResourceID,
    'plan_id': 'basic',
    'processed': 1446292800000,
    'accumulated_usage_id': `t/0001446292800000-0-0-0-1/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/t/0001446292800000-0-0-0-1`,
    'processed_id': '0001446292800000'
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
                    {
                      'quantity': 12
                    },
                    null
                  ],
                  [
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    {
                      'quantity': 12
                    }
                  ]
                ]
              }
            ],
            'resource_instances': [
              {
                'id': testResourceInstanceIDs[0],
                't': '0001446251400002',
                'p': 1446251400002
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'start': 1446251400000,
    'end': 1446350400000,
    'organization_id': testOrganizationID,
    'resource_instance_id': testResourceInstanceIDs[0],
    'resource_id': testResourceID,
    'plan_id': 'basic',
    'processed': 1446292800000,
    'accumulated_usage_id': `t/0001446292800000-0-0-0-1/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/${testConsumerID}/t/0001446292800000-0-0-0-1`,
    'processed_id': '0001446292800000'
  },
  {
    'space_id': testSpaceID,
    'consumers': [
      {
        'id': testConsumerID,
        't': '0001446292800000-0-0-0-1'
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
                    {
                      'quantity': 12
                    },
                    null
                  ],
                  [
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    {
                      'quantity': 12
                    }
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
    'start': 1446251400000,
    'end': 1446350400000,
    'organization_id': testOrganizationID,
    'processed': 1446292800000,
    'accumulated_usage_id': `t/0001446292800000-0-0-0-1/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/t/0001446292800000-0-0-0-1`,
    'processed_id': '0001446292800000'
  },
  {
    'processed': 1446292800000,
    'accumulated_usage_id': `t/0001446292800000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testResourceInstanceIDs[0]}/${testConsumerID}/${testPlanID}/` + 
      `${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}/t/0001446251400000/0001446249600000`,
    'processed_id': '0001446292800000'
  }
];

module.exports = {
  shiftsMonthWindowsExpected
};

