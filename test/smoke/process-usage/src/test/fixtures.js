'use strict';

const timewindow = require('abacus-timewindow');

const { times } = require('underscore');

const { fixturesCfg } = require('./env-config');
// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () =>
  /^[0-9]+[MDhms]$/.test(fixturesCfg.slack)
    ? {
      scale: fixturesCfg.slack.charAt(fixturesCfg.slack.length - 1),
      width: fixturesCfg.slack.match(/[0-9]+/)[0]
    }
    : {
      scale: timewindow.dimension.min,
      width: 10
    };  
const initWindows = (win, dimension) => {
  const windows = [win];

  if(fixturesCfg.windowsSizes && fixturesCfg.windowsSizes[dimension])
    times(fixturesCfg.windowsSizes[dimension] - 1, () => windows.push(null));

  else {
    const timeWindows = timewindow.timeWindowsSizes(slack(), fixturesCfg.windowsSizes);
    times(timeWindows.getWindows(dimension).length - 1, () => windows.push(null));
  }

  return windows;
};

const buildExpectedWindows = (summary, quantity) => {

  const addProperty = (key, value, obj) => {
    if (value !== undefined)
      obj[key] = value;
  };

  const win = {};
  addProperty('quantity', quantity, win);
  addProperty('summary', summary, win);

  return [
    [null],
    [null],
    [null],
    initWindows(win, timewindow.dimension.day),
    initWindows(win, timewindow.dimension.month)
  ];
};

// Initial expected usage report for the test organization
const initialExpectedReport = {
  organization_id: 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
  account_id: '1234',
  resources: [
    {
      resource_id: 'object-storage',
      aggregated_usage: [
        {
          metric: 'storage',
          windows: buildExpectedWindows(1, 1)
        },
        {
          metric: 'thousand_light_api_calls',
          windows: buildExpectedWindows(3, 3)
        },
        {
          metric: 'heavy_api_calls',
          windows: buildExpectedWindows(300, 300)
        }
      ],
      plans: [
        {
          plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
          metering_plan_id: 'basic-object-storage',
          rating_plan_id: 'object-rating-plan',
          pricing_plan_id: 'object-pricing-basic',
          aggregated_usage: [
            {
              metric: 'storage',
              windows: buildExpectedWindows(1, 1)
            },
            {
              metric: 'thousand_light_api_calls',
              windows: buildExpectedWindows(3, 3)
            },
            {
              metric: 'heavy_api_calls',
              windows: buildExpectedWindows(300, 300)
            }
          ]
        }
      ]
    }
  ],
  spaces: [
    {
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      resources: [
        {
          resource_id: 'object-storage',
          aggregated_usage: [
            {
              metric: 'storage',
              windows: buildExpectedWindows(1, 1)
            },
            {
              metric: 'thousand_light_api_calls',
              windows: buildExpectedWindows(3, 3)
            },
            {
              metric: 'heavy_api_calls',
              windows: buildExpectedWindows(300, 300)
            }
          ],
          plans: [
            {
              plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: buildExpectedWindows(1, 1)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: buildExpectedWindows(3, 3)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: buildExpectedWindows(300, 300)
                }
              ]
            }
          ]
        }
      ],
      consumers: [
        {
          consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resources: [
            {
              resource_id: 'object-storage',
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: buildExpectedWindows(1, 1)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: buildExpectedWindows(3, 3)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: buildExpectedWindows(300, 300)
                }
              ],
              plans: [
                {
                  plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
                  metering_plan_id: 'basic-object-storage',
                  rating_plan_id: 'object-rating-plan',
                  pricing_plan_id: 'object-pricing-basic',
                  resource_instances: [
                    {
                      id: '0b39fa70-a65f-4183-bae8-385633ca5c87'
                    }
                  ],
                  aggregated_usage: [
                    {
                      metric: 'storage',
                      windows: buildExpectedWindows(1, 1)
                    },
                    {
                      metric: 'thousand_light_api_calls',
                      windows: buildExpectedWindows(3, 3)
                    },
                    {
                      metric: 'heavy_api_calls',
                      windows: buildExpectedWindows(300, 300)
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

const buildUsage = (testOrgID, time) => (
  {
    start: time,
    end: time,
    organization_id: testOrgID,
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'object-storage',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'storage',
        quantity: 1073741824
      },
      {
        measure: 'light_api_calls',
        quantity: 1000
      },
      {
        measure: 'heavy_api_calls',
        quantity: 100
      }
    ]
  });

module.exports = {
  buildUsage,
  initialExpectedReport
};
