'use strict';

const timewindow = require('abacus-timewindow');

const { times } = require('underscore');

const { fixturesCfg } = require('./env-config');

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const _slack = () =>
  /^[0-9]+[MDhms]$/.test(fixturesCfg.slack)
    ? {
      scale: fixturesCfg.slack.charAt(fixturesCfg.slack.length - 1),
      width: fixturesCfg.slack.substring(0, fixturesCfg.slack.length - 1)
    }
    : {
      scale: timewindow.dimension.min,
      width: 10
    };  

const _createWindows = (win, dimension) => {
  const windows = [win];

  if(fixturesCfg.windowsSizes && fixturesCfg.windowsSizes[dimension])
    times(fixturesCfg.windowsSizes[dimension] - 1, () => windows.push(null));
  else {
    const timeWindows = timewindow.timeWindowsSizes(_slack(), fixturesCfg.windowsSizes);
    times(timeWindows.getWindows(dimension).length - 1, () => windows.push(null));
  }

  return windows;
};

const _buildExpectedWindows = (summary, quantity) => {
  const win = {
    quantity: quantity,
    summary: summary
  };
  
  return [
    [null],
    [null],
    [null],
    _createWindows(win, timewindow.dimension.day),
    _createWindows(win, timewindow.dimension.month)
  ];
};

// Initial expected usage report for the test organization
const createExpectedInitialReport = (orgID, summaries, quantites) => ({
  organization_id: orgID,
  account_id: '1234',
  resources: [
    {
      resource_id: 'object-storage',
      aggregated_usage: [
        {
          metric: 'storage',
          windows: _buildExpectedWindows(summaries.storage, quantites.storage)
        },
        {
          metric: 'thousand_light_api_calls',
          windows: _buildExpectedWindows(summaries.lightAPICalls, quantites.lightAPICalls)
        },
        {
          metric: 'heavy_api_calls',
          windows: _buildExpectedWindows(summaries.heavyAPICalls, quantites.heavyAPICalls)
        }
      ],
      plans: [
        {
          plan_id: 'basic/basic-object-storage/object-rating-plan/object-pricing-basic',
          metering_plan_id: 'basic-object-storage',
          rating_plan_id: 'object-rating-plan',
          pricing_plan_id: 'object-pricing-basic',
          aggregated_usage: [
            {
              metric: 'storage',
              windows: _buildExpectedWindows(summaries.storage, quantites.storage)
            },
            {
              metric: 'thousand_light_api_calls',
              windows: _buildExpectedWindows(summaries.lightAPICalls, quantites.lightAPICalls)
            },
            {
              metric: 'heavy_api_calls',
              windows: _buildExpectedWindows(summaries.heavyAPICalls, quantites.heavyAPICalls)
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
              windows: _buildExpectedWindows(summaries.storage, quantites.storage)
            },
            {
              metric: 'thousand_light_api_calls',
              windows: _buildExpectedWindows(summaries.lightAPICalls, quantites.lightAPICalls)
            },
            {
              metric: 'heavy_api_calls',
              windows: _buildExpectedWindows(summaries.heavyAPICalls, quantites.heavyAPICalls)
            }
          ],
          plans: [
            {
              plan_id: 'basic/basic-object-storage/object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: _buildExpectedWindows(summaries.storage, quantites.storage)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: _buildExpectedWindows(summaries.lightAPICalls, quantites.lightAPICalls)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: _buildExpectedWindows(summaries.heavyAPICalls, quantites.heavyAPICalls)
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
                  windows: _buildExpectedWindows(summaries.storage, quantites.storage)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: _buildExpectedWindows(summaries.lightAPICalls, quantites.lightAPICalls)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: _buildExpectedWindows(summaries.heavyAPICalls, quantites.heavyAPICalls)
                }
              ],
              plans: [
                {
                  plan_id: 'basic/basic-object-storage/object-rating-plan/object-pricing-basic',
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
                      windows: _buildExpectedWindows(summaries.storage, quantites.storage)
                    },
                    {
                      metric: 'thousand_light_api_calls',
                      windows: _buildExpectedWindows(summaries.lightAPICalls, quantites.lightAPICalls)
                    },
                    {
                      metric: 'heavy_api_calls',
                      windows: _buildExpectedWindows(summaries.heavyAPICalls, quantites.heavyAPICalls)
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
});

const buildUsage = (orgID, time, quantites) => (
  {
    start: time,
    end: time,
    organization_id: orgID,
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'app:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'object-storage',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'storage',
        quantity: quantites.storage
      },
      {
        measure: 'light_api_calls',
        quantity: quantites.lightAPICalls
      },
      {
        measure: 'heavy_api_calls',
        quantity: quantites.heavyAPICalls
      }
    ]
  });

module.exports = {
  buildUsage,
  createExpectedInitialReport
};
