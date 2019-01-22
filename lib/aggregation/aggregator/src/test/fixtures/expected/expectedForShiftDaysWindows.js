'use strict';

const {
  testResourceID, testOrganizationID, testSpaceID, testConsumerID, testPlanID,
  testAccountID, testMeteringPlanID, testRatingPlanID, testPricingPlanID, testResourceInstanceIDs
} = require('../usageDocumentFieldsConstants');


const shiftsDaysWindowsExpected = [
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
                    null,
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null,
                    null,
                    {
                      'quantity': 10
                    },
                    null
                  ],
                  [
                    {
                      'quantity': 20,
                      'previous_quantity': 10
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
        't': '0001446721200000-0-0-0-0'
      }
    ],
    'account_id': testAccountID,
    'start': 1446631800000,
    'end': 1446631800000,
    'resource_instance_id': testResourceInstanceIDs[0],
    'consumer_id': testConsumerID,
    'resource_id': testResourceID,
    'plan_id': 'basic',
    'processed': 1446721200000,
    'accumulated_usage_id': `t/0001446721200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/t/0001446721200000-0-0-0-0`,
    'processed_id': '0001446721200000'
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
                    null,
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null,
                    null,
                    {
                      'quantity': 10
                    },
                    null
                  ],
                  [
                    {
                      'quantity': 20,
                      'previous_quantity': 10
                    },
                    null
                  ]
                ]
              }
            ],
            'resource_instances': [
              {
                'id': testResourceInstanceIDs[0],
                't': '0001446721200000',
                'p': 1446721200000
              }
            ],
            'metering_plan_id': testMeteringPlanID,
            'rating_plan_id': testRatingPlanID,
            'pricing_plan_id': testPricingPlanID
          }
        ]
      }
    ],
    'start': 1446631800000,
    'end': 1446631800000,
    'organization_id': testOrganizationID,
    'resource_instance_id': testResourceInstanceIDs[0],
    'resource_id': testResourceID,
    'plan_id': 'basic',
    'processed': 1446721200000,
    'accumulated_usage_id': `t/0001446721200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/${testConsumerID}/t/0001446721200000-0-0-0-0`,
    'processed_id': '0001446721200000'
  },
  {
    'space_id': testSpaceID,
    'consumers': [
      {
        'id': testConsumerID,
        't': '0001446721200000-0-0-0-0'
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
                    null,
                    {
                      'quantity': 10,
                      'previous_quantity': null
                    },
                    null,
                    null,
                    {
                      'quantity': 10
                    },
                    null
                  ],
                  [
                    {
                      'quantity': 20,
                      'previous_quantity': 10
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
    'start': 1446631800000,
    'end': 1446631800000,
    'organization_id': testOrganizationID,
    'processed': 1446721200000,
    'accumulated_usage_id': `t/0001446721200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testSpaceID}/t/0001446721200000-0-0-0-0`,
    'processed_id': '0001446721200000'
  },
  {
    'processed': 1446721200000,
    'accumulated_usage_id': `t/0001446721200000-0-0-0-0/k/${testOrganizationID}`,
    'id': `k/${testOrganizationID}/${testResourceInstanceIDs[0]}/${testConsumerID}/${testPlanID}/` +
      `${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}/t/0001446631800000/0001446631800000`,
    'processed_id': '0001446721200000'
  }
];

module.exports = {
  shiftsDaysWindowsExpected
};

