'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date, no-unused-expressions */
const { map } = require('underscore');

const dbclient = require('abacus-dbclient');
// const moment = require('abacus-moment');

const { buildAccumulatedUsage } = require('./templates');  

// const octDay = {
//   quantity: {
//     current: { consumed: 172800000, consuming: 2, since: 1446249600000 }
//   },
//   cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
// };
// const octMonth = {
//   quantity: {
//     current: { consumed: -5011200000, consuming: 2, since: 1446249600000 }
//   },
//   cost: { consumed: -5011200000, consuming: 2, price: 0.00014 }
// };
// const nov1Day = {
//   quantity: {
//     current: { consumed: 172800000, consuming: 2, since: 1446336000000 }
//   },
//   cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
// };
// const nov1Month = {
//   quantity: {
//     current: { consumed: 5184000000, consuming: 2, since: 1446336000000 }
//   },
//   cost: { consumed: 5184000000, consuming: 2, price: 0.00014 }
// };
// const nov2Day = {
//   quantity: {
//     previous: { consumed: 172800000, consuming: 2, since: 1446336000000 },
//     current: { consumed: 72000000, consuming: 1, since: 1446422400000 }
//   },
//   cost: { consumed: 72000000, consuming: 1, price: 0.00014 }
// };
// const nov2Month = {
//   quantity: {
//     previous: { consumed: 5184000000, consuming: 2, since: 1446336000000 },
//     current: { consumed: 2750400000, consuming: 1, since: 1446422400000 }
//   },
//   cost: { consumed: 2750400000, consuming: 1, price: 0.00014 }
// };

const jan1Day = {
  quantity: {
    current: { consumed: 172800000, consuming: 2, since: 1454198400000 }
  }
};
const jan1Month = {
  quantity: {
    current: { consumed: -5011200000, consuming: 2, since: 1454198400000 }
  }
};
const jan2Day = {
  quantity: {
    previous: { consumed: 172800000, consuming: 2, since: 1454198400000 },
    current: { consumed: 144000000, consuming: 1, since: 1454227200000 }
  }
};
const jan2Month = {
  quantity: {
    previous: { consumed: -5011200000, consuming: 2, since: 1454198400000 },
    current: { consumed: -2448000000, consuming: 1, since: 1454227200000 }
  }
};
const febDay = {
  quantity: {
    current: { consumed: 115200000, consuming: 2, since: 1454299200000 }
  }
};
const febMonth = {
  quantity: {
    current: { consumed: 4953600000, consuming: 2, since: 1454299200000 }
  }
};

const usagesForCorrectWindows = [
  buildAccumulatedUsage('bounds', 1454198400000, 1454198400000, 1454198400000),
  buildAccumulatedUsage('bounds', 1454227200000, 1454227200000, 1454313600000),
  buildAccumulatedUsage('bounds', 1454299200000, 1454299200000, 1454313600000)
];
usagesForCorrectWindows[0].accumulated_usage = [
  {
    metric: 'memory',
    windows: [[null], [null], [null], [jan1Day, null, null], [jan1Month, null]]
  }
];
usagesForCorrectWindows[1].accumulated_usage = [
  {
    metric: 'memory',
    windows: [[null], [null], [null], [null, jan2Day, null], [null, jan2Month]]
  }
];
usagesForCorrectWindows[2].accumulated_usage = [
  {
    metric: 'memory',
    windows: [[null], [null], [null], [febDay, jan2Day, null], [febMonth, jan2Month]]
  }
];

const expectedForCorrectWindows = [
  [null],
  [null],
  [null],
  [
    {
      quantity: { consuming: 2, consumed: 115200000 },
      previous_quantity: null
    },
    null,
    null
  ],
  [
    {
      quantity: { consuming: 2, consumed: 4953600000 },
      previous_quantity: null
    },
    null
  ]
];

const correctWindowsTestFixtures = {
  usage: usagesForCorrectWindows,
  expected: expectedForCorrectWindows
};

const usagesForShiftWindow = [
  buildAccumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
  buildAccumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
  buildAccumulatedUsage('bounds', 1462060800000, 1462060800000, 1462060800000)
];
const body = () => ({
  metric: 'heavy_api_calls',
  windows: [
    [null],
    [null],
    [null],
    [{ quantity: { current: 500 } }, null, null],
    [{ quantity: { current: 500 } }, null]
  ]
});
usagesForShiftWindow[0].accumulated_usage = [body()];
usagesForShiftWindow[1].accumulated_usage = [body()];
usagesForShiftWindow[2].accumulated_usage = [body()];
usagesForShiftWindow[1].plan_id = 'standard';

// Expected values for the different levels of aggregation
const expectedForShiftWindow = {
  metric: 'heavy_api_calls',
  windows: [
    [null],
    [null],
    [null],
    [{ quantity: 500, previous_quantity: null }, null, null],
    [{ quantity: 500, previous_quantity: null }, null]
  ]
};

const shiftWindowsTestFixtures = {
  usage: usagesForShiftWindow,
  expected: expectedForShiftWindow
};


// const now = moment.utc().toDate();
// const processed = [
//   Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0),
//   Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1),
//   Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2),
//   Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3)
// ];


const testResourceInstanceID = '0b39fa70-a65f-4183-bae8-385633ca5c87';
const testOrgID = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
const testSpaceID = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
const testConsumerID = 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';
const pid = 'basic/test-metering-plan/test-rating-plan/test-pricing-basic';

const usageForAggregatesUsage = [
  buildAccumulatedUsage(
    testResourceInstanceID,
    1420243200000,
    1420245000000,
    1420245000001,
    {
      quantity: { current: 12 }
    },
    {
      quantity: {
        current: {
          consumed: 518400000,
          consuming: 6,
          since: 1420243200000
        }
      }
    },
    {
      quantity: {
        current: {
          consumed: 13996800000,
          consuming: 6,
          since: 1420243200000
        }
      }
    }
  ),
  buildAccumulatedUsage(
    testResourceInstanceID,
    1420245000000,
    1420247000000,
    1420247000001,
    {
      quantity: { previous: 12, current: 22 }
    },
    {
      quantity: {
        previous: {
          consumed: 518400000,
          consuming: 6,
          since: 1420243200000
        },
        current: { 
          consumed: 684000000, 
          consuming: 8, 
          since: 1420245000000 }
      }
    },
    {
      quantity: {
        previous: {
          consumed: 13996800000,
          consuming: 6,
          since: 1420243200000
        },
        current: {
          consumed: 18655200000,
          consuming: 8,
          since: 1420245000000
        }
      }
    }
  ),
  buildAccumulatedUsage(
    '1b39fa70-a65f-4183-bae8-385633ca5c88',
    1420247000000,
    1420249000000,
    1420249000001,
    {
      quantity: { current: 8 }
    },
    {
      quantity: {
        current: {
          consumed: 236400000,
          consuming: 3,
          since: 1420247000000
        }
      }
    },
    {
      quantity: {
        current: {
          consumed: 6975600000,
          consuming: 3,
          since: 1420247000000
        }
      }
    }
  ),
  buildAccumulatedUsage(
    '1b39fa70-a65f-4183-bae8-385633ca5c88',
    1420249000000,
    1420251000000,
    1420251000001,
    {
      quantity: { previous: 8, current: 10 }
    },
    {
      quantity: {
        previous: {
          consumed: 236400000,
          consuming: 3,
          since: 1420247000000
        },
        current: {
          consumed: 161600000,
          consuming: 2,
          since: 1420249000000
        }
      }
    },
    {
      quantity: {
        previous: {
          consumed: 6975600000,
          consuming: 3,
          since: 1420247000000
        },
        current: {
          consumed: 4654400000,
          consuming: 2,
          since: 1420249000000
        }
      }
    }
  )
];

// Helper function for creating windows
const twindows = (dailyQuantity, monthlyQuantity, previousDailyQuantity, previousMonthlyQuantity) => {
  const win = [[null], [null], [null], [null, null, null], [null, null]];
  win[3][0] = { quantity: dailyQuantity, previous_quantity: previousDailyQuantity };
  win[4][0] = { quantity: monthlyQuantity, previous_quantity: previousMonthlyQuantity };
  return win;
};

const resource = (apiDQ, apiMQ, memDQ, memMQ, papiDQ, papiMQ, pmemDQ, pmemMQ) => {
  return [
    {
      resource_id: 'test-resource',
      plans: [
        {
          plan_id: pid,
          rating_plan_id: 'test-rating-plan',
          pricing_plan_id: 'test-pricing-basic',
          metering_plan_id: 'test-metering-plan',
          aggregated_usage: [
            {
              metric: 'heavy_api_calls',
              windows: twindows(apiDQ, apiMQ, papiDQ, papiMQ)
            },
            {
              metric: 'memory',
              windows: twindows(memDQ, memMQ, pmemDQ, pmemMQ)
            }
          ]
        }
      ]
    }
  ];
};

// Helper function to create resource instance reference
const rireference = (usage) => {
  return {
    id: usage.resource_instance_id,
    t: dbclient.t(usage.id),
    p: usage.processed
  };
};

// Helper function for creating consumer resources
const cresource = (apiDQ, apiMQ, memDQ, memMQ, usages, papiDQ, papiMQ, pmemDQ, pmemMQ) => [
  {
    resource_id: 'test-resource',
    plans: [
      {
        plan_id: pid,
        rating_plan_id: 'test-rating-plan',
        pricing_plan_id: 'test-pricing-basic',
        metering_plan_id: 'test-metering-plan',
        resource_instances: map(usages, rireference),
        aggregated_usage: [
          {
            metric: 'heavy_api_calls',
            windows: twindows(apiDQ, apiMQ, papiDQ, papiMQ)
          },
          {
            metric: 'memory',
            windows: twindows(memDQ, memMQ, pmemDQ, pmemMQ)
          }
        ]
      }
    ]
  }
];

const expectedConsumersDocsForAggregateUsage = [
  {
    consumer_id: testConsumerID,
    organization_id: testOrgID,
    start: 1420243200000,
    end: 1420245000000,
    resource_instance_id: testResourceInstanceID,
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    resources: cresource(
      12,
      12,
      { consumed: 518400000, consuming: 6 },
      { consumed: 13996800000, consuming: 6 },
      [usageForAggregatesUsage[0]],
      null,
      null,
      null,
      null
    )
  },
  {
    consumer_id: testConsumerID,
    organization_id: testOrgID,
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    start: 1420245000000,
    end: 1420247000000,
    resource_instance_id: testResourceInstanceID,
    resources: cresource(
      22,
      22,
      { consumed: 684000000, consuming: 8 },
      { consumed: 18655200000, consuming: 8 },
      [usageForAggregatesUsage[1]],
      12,
      12,
      { consumed: 518400000, consuming: 6 },
      { consumed: 13996800000, consuming: 6 }
    )
  },
  {
    consumer_id: testConsumerID,
    organization_id: testOrgID,
    resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    start: 1420247000000,
    end: 1420249000000,
    resources: cresource(
      30,
      30,
      { consumed: 920400000, consuming: 11 },
      { consumed: 25630800000, consuming: 11 },
      [usageForAggregatesUsage[1], usageForAggregatesUsage[2]],
      22,
      22,
      { consumed: 684000000, consuming: 8 },
      { consumed: 18655200000, consuming: 8 }
    )
  },
  {
    consumer_id: testConsumerID,
    organization_id: testOrgID,
    resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    start: 1420249000000,
    end: 1420251000000,
    resources: cresource(
      32,
      32,
      { consumed: 845600000, consuming: 10 },
      { consumed: 23309600000, consuming: 10 },
      [usageForAggregatesUsage[1], usageForAggregatesUsage[3]],
      30,
      30,
      { consumed: 920400000, consuming: 11 },
      { consumed: 25630800000, consuming: 11 }
    )
  }
];


const expectedOrgsDocsForAggregateUsage = [
  {
    organization_id: testOrgID,
    account_id: '1234',
    consumer_id: testConsumerID,
    resource_instance_id: testResourceInstanceID,
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    accumulated_usage_id: '222',
    start: 1420243200000,
    end: 1420245000000,
    resources: resource(
      12,
      12,
      { consumed: 518400000, consuming: 6 },
      { consumed: 13996800000, consuming: 6 },
      null,
      null,
      null,
      null
    ),
    spaces: [
      {
        space_id: testSpaceID,
        t: '0001420286400000'
      }
    ]
  },
  {
    organization_id: testOrgID,
    account_id: '1234',
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    consumer_id: testConsumerID,
    resource_instance_id: testResourceInstanceID,
    accumulated_usage_id: '223',
    start: 1420245000000,
    end: 1420247000000,
    resources: resource(
      22,
      22,
      { consumed: 684000000, consuming: 8 },
      { consumed: 18655200000, consuming: 8 },
      12,
      12,
      { consumed: 518400000, consuming: 6 },
      { consumed: 13996800000, consuming: 6 }
    ),
    spaces: [
      {
        space_id: testSpaceID,
        t: '0001420286400000'
      }
    ]
  },
  {
    organization_id: testOrgID,
    account_id: '1234',
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    accumulated_usage_id: '224',
    consumer_id: testConsumerID,
    resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
    start: 1420247000000,
    end: 1420249000000,
    resources: resource(
      30,
      30,
      { consumed: 920400000, consuming: 11 },
      { consumed: 25630800000, consuming: 11 },
      22,
      22,
      { consumed: 684000000, consuming: 8 },
      { consumed: 18655200000, consuming: 8 }
    ),
    spaces: [
      {
        space_id: testSpaceID,
        t: '0001420286400000'
      }
    ]
  },
  {
    organization_id: testOrgID,
    account_id: '1234',
    resource_id: 'test-resource',
    plan_id: 'basic',
    pricing_country: 'USA',
    prices: {
      metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
    },
    accumulated_usage_id: '225',
    consumer_id: testConsumerID,
    resource_instance_id: '1b39fa70-a65f-4183-bae8-385633ca5c88',
    start: 1420249000000,
    end: 1420251000000,
    resources: resource(
      32,
      32,
      { consumed: 845600000, consuming: 10 },
      { consumed: 23309600000, consuming: 10 },
      30,
      30,
      { consumed: 920400000, consuming: 11 },
      { consumed: 25630800000, consuming: 11 }
    ),
    spaces: [
      {
        space_id: testSpaceID,
        t: '0001420286400000'
      }
    ]
  }
];

const aggregateUsageTestFixtures = {
  usage: usageForAggregatesUsage,
  expected: {
    organizationDocs: expectedOrgsDocsForAggregateUsage,
    consumerDocs: expectedConsumersDocsForAggregateUsage
  }
};



// =======================================================================
const usageForAggregatesInitialUsage = buildAccumulatedUsage(
  testResourceInstanceID,
  1420243200000,
  1420245000000,
  1420245000001,
  {
    quantity: { current: 12 }
  },
  {
    quantity: {
      current: {
        consumed: 518400000,
        consuming: 6,
        since: 1420243200000
      }
    }
  },
  {
    quantity: {
      current: {
        consumed: 13996800000,
        consuming: 6,
        since: 1420243200000
      }
    }
  }
);

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
        't': '0001420286400000-0-0-0-0'
      }
    ],
    'account_id': '1234',
    'start': 1420243200000,
    'end': 1420245000000,
    'resource_instance_id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
    'consumer_id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    'resource_id': 'test-resource',
    'plan_id': 'basic',
    'pricing_country': 'USA',
    'prices': {
      'metrics': [
        {
          'name': 'heavy_api_calls',
          'price': 0.15
        },
        {
          'name': 'memory',
          'price': 0.00014
        }
      ]
    },
    'processed': 1420286400000,
    'accumulated_usage_id': 't/0001420286400000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/t/0001420286400000-0-0-0-0',
    'processed_id': '0001420286400000'
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
                't': '0001420245000001',
                'p': 1420245000001
              }
            ],
            'metering_plan_id': 'test-metering-plan',
            'rating_plan_id': 'test-rating-plan',
            'pricing_plan_id': 'test-pricing-basic'
          }
        ]
      }
    ],
    'start': 1420243200000,
    'end': 1420245000000,
    'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'resource_instance_id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
    'resource_id': 'test-resource',
    'plan_id': 'basic',
    'pricing_country': 'USA',
    'prices': {
      'metrics': [
        {
          'name': 'heavy_api_calls',
          'price': 0.15
        },
        {
          'name': 'memory',
          'price': 0.00014
        }
      ]
    },
    'processed': 1420286400000,
    'accumulated_usage_id': 't/0001420286400000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/' + 
      'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/t/0001420286400000-0-0-0-0',
    'processed_id': '0001420286400000'
  },
  {
    'space_id': 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    'consumers': [
      {
        'id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
        't': '0001420286400000-0-0-0-0'
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
    'start': 1420243200000,
    'end': 1420245000000,
    'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'processed': 1420286400000,
    'accumulated_usage_id': 't/0001420286400000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/t/0001420286400000-0-0-0-0',
    'processed_id': '0001420286400000'
  },
  {
    'processed': 1420286400000,
    'accumulated_usage_id': 't/0001420286400000-0-0-0-0/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/0b39fa70-a65f-4183-bae8-385633ca5c87/' + 
      'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/basic/test-metering-plan/test-rating-plan/test-pricing-basic/' + 
      't/0001420245000000/0001420243200000',
    'processed_id': '0001420286400000'
  }
];





const aggregatesUsageWithExistingResource = {
  withSameResourceId: buildAccumulatedUsage(
    testResourceInstanceID,
    1420245000000,
    1420247000000,
    1420247000001,
    {
      quantity: { previous: 12, current: 22 }
    },
    {
      quantity: {
        previous: {
          consumed: 518400000,
          consuming: 6,
          since: 1420243200000
        },
        current: { 
          consumed: 684000000, 
          consuming: 8, 
          since: 1420245000000 }
      }
    },
    {
      quantity: {
        previous: {
          consumed: 13996800000,
          consuming: 6,
          since: 1420243200000
        },
        current: {
          consumed: 18655200000,
          consuming: 8,
          since: 1420245000000
        }
      }
    }
  ), 
  withDifferentResourceId: buildAccumulatedUsage(
    '1b39fa70-a65f-4183-bae8-385633ca5c88',
    1420247000000,
    1420249000000,
    1420249000001,
    {
      quantity: { current: 8 }
    },
    {
      quantity: {
        current: {
          consumed: 236400000,
          consuming: 3,
          since: 1420247000000
        }
      }
    },
    {
      quantity: {
        current: {
          consumed: 6975600000,
          consuming: 3,
          since: 1420247000000
        }
      }
    }
  )
};

const aggregatesWithExistingResourceExpected = {
  withSameResourceId: [
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
                        'quantity': 22,
                        'previous_quantity': 12
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': 22,
                        'previous_quantity': 12
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
                          'consuming': 8,
                          'consumed': 684000000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 518400000
                        }
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': {
                          'consuming': 8,
                          'consumed': 18655200000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 13996800000
                        }
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
          't': '0001420286400000-0-0-0-1'
        }
      ],
      'account_id': '1234',
      'start': 1420245000000,
      'end': 1420247000000,
      'resource_instance_id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
      'consumer_id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      'resource_id': 'test-resource',
      'plan_id': 'basic',
      'pricing_country': 'USA',
      'prices': {
        'metrics': [
          {
            'name': 'heavy_api_calls',
            'price': 0.15
          },
          {
            'name': 'memory',
            'price': 0.00014
          }
        ]
      },
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/t/0001420286400000-0-0-0-1',
      'processed_id': '0001420286400000'
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
                        'quantity': 22,
                        'previous_quantity': 12
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': 22,
                        'previous_quantity': 12
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
                          'consuming': 8,
                          'consumed': 684000000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 518400000
                        }
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': {
                          'consuming': 8,
                          'consumed': 18655200000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 13996800000
                        }
                      },
                      null
                    ]
                  ]
                }
              ],
              'resource_instances': [
                {
                  'id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
                  't': '0001420247000001',
                  'p': 1420247000001
                }
              ],
              'metering_plan_id': 'test-metering-plan',
              'rating_plan_id': 'test-rating-plan',
              'pricing_plan_id': 'test-pricing-basic'
            }
          ]
        }
      ],
      'start': 1420245000000,
      'end': 1420247000000,
      'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'resource_instance_id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
      'resource_id': 'test-resource',
      'plan_id': 'basic',
      'pricing_country': 'USA',
      'prices': {
        'metrics': [
          {
            'name': 'heavy_api_calls',
            'price': 0.15
          },
          {
            'name': 'memory',
            'price': 0.00014
          }
        ]
      },
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/' + 
      'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/t/0001420286400000-0-0-0-1',
      'processed_id': '0001420286400000'
    },
    {
      'space_id': 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      'consumers': [
        {
          'id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          't': '0001420286400000-0-0-0-1'
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
                        'quantity': 22,
                        'previous_quantity': 12
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': 22,
                        'previous_quantity': 12
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
                          'consuming': 8,
                          'consumed': 684000000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 518400000
                        }
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': {
                          'consuming': 8,
                          'consumed': 18655200000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 13996800000
                        }
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
      'start': 1420245000000,
      'end': 1420247000000,
      'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/t/0001420286400000-0-0-0-1',
      'processed_id': '0001420286400000'
    },
    {
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/0b39fa70-a65f-4183-bae8-385633ca5c87/' + 
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/basic/test-metering-plan/test-rating-plan/' + 
        'test-pricing-basic/t/0001420247000000/0001420245000000',
      'processed_id': '0001420286400000'
    }
  ],
  withDifferentResourceId: [
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
                        'quantity': 20,
                        'previous_quantity': 12
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': 20,
                        'previous_quantity': 12
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
                          'consuming': 9,
                          'consumed': 754800000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 518400000
                        }
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': {
                          'consuming': 9,
                          'consumed': 20972400000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 13996800000
                        }
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
          't': '0001420286400000-0-0-0-1'
        }
      ],
      'account_id': '1234',
      'start': 1420247000000,
      'end': 1420249000000,
      'resource_instance_id': '1b39fa70-a65f-4183-bae8-385633ca5c88',
      'consumer_id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
      'resource_id': 'test-resource',
      'plan_id': 'basic',
      'pricing_country': 'USA',
      'prices': {
        'metrics': [
          {
            'name': 'heavy_api_calls',
            'price': 0.15
          },
          {
            'name': 'memory',
            'price': 0.00014
          }
        ]
      },
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/t/0001420286400000-0-0-0-1',
      'processed_id': '0001420286400000'
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
                        'quantity': 20,
                        'previous_quantity': 12
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': 20,
                        'previous_quantity': 12
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
                          'consuming': 9,
                          'consumed': 754800000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 518400000
                        }
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': {
                          'consuming': 9,
                          'consumed': 20972400000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 13996800000
                        }
                      },
                      null
                    ]
                  ]
                }
              ],
              'resource_instances': [
                {
                  'id': '0b39fa70-a65f-4183-bae8-385633ca5c87',
                  't': '0001420245000001',
                  'p': 1420245000001
                },
                {
                  'id': '1b39fa70-a65f-4183-bae8-385633ca5c88',
                  't': '0001420249000001',
                  'p': 1420249000001
                }
              ],
              'metering_plan_id': 'test-metering-plan',
              'rating_plan_id': 'test-rating-plan',
              'pricing_plan_id': 'test-pricing-basic'
            }
          ]
        }
      ],
      'start': 1420247000000,
      'end': 1420249000000,
      'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'resource_instance_id': '1b39fa70-a65f-4183-bae8-385633ca5c88',
      'resource_id': 'test-resource',
      'plan_id': 'basic',
      'pricing_country': 'USA',
      'prices': {
        'metrics': [
          {
            'name': 'heavy_api_calls',
            'price': 0.15
          },
          {
            'name': 'memory',
            'price': 0.00014
          }
        ]
      },
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/' + 
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/t/0001420286400000-0-0-0-1',
      'processed_id': '0001420286400000'
    },
    {
      'space_id': 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      'consumers': [
        {
          'id': 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          't': '0001420286400000-0-0-0-1'
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
                        'quantity': 20,
                        'previous_quantity': 12
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': 20,
                        'previous_quantity': 12
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
                          'consuming': 9,
                          'consumed': 754800000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 518400000
                        }
                      },
                      null,
                      null
                    ],
                    [
                      {
                        'quantity': {
                          'consuming': 9,
                          'consumed': 20972400000
                        },
                        'previous_quantity': {
                          'consuming': 6,
                          'consumed': 13996800000
                        }
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
      'start': 1420247000000,
      'end': 1420249000000,
      'organization_id': 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/t/0001420286400000-0-0-0-1',
      'processed_id': '0001420286400000'
    },
    {
      'processed': 1420286400000,
      'accumulated_usage_id': 't/0001420286400000-0-0-0-1/k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
      'id': 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/1b39fa70-a65f-4183-bae8-385633ca5c88/' + 
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/basic/test-metering-plan/test-rating-plan/' + 
        'test-pricing-basic/t/0001420249000000/0001420247000000',
      'processed_id': '0001420286400000'
    }
  ]
};

const aggregatesInitialUsageFixture = {
  usage: usageForAggregatesInitialUsage,
  expected: aggregatesInitialUsageExpected
};

const aggregatesWithExisitingUsageFixture = {
  usage: aggregatesUsageWithExistingResource,
  expected: aggregatesWithExistingResourceExpected
};



module.exports = { 
  correctWindowsTestFixtures, shiftWindowsTestFixtures, aggregateUsageTestFixtures, 
  
  aggregatesInitialUsageFixture, aggregatesWithExisitingUsageFixture
};
