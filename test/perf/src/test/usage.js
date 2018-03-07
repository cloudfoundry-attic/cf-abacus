'use strict';

const { each, last, first, keys } = require('underscore');

const uuid = require('uuid');

const moment = require('abacus-moment');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

// Compute the test costs
const storageCost = (numberOfResourceInstances) =>
  new BigNumber(1.0)
    .mul(numberOfResourceInstances)
    .toNumber();
const lightCost = (numberOfResourceInstances, n, numberOfExecutions) =>
  new BigNumber(0.03)
    .mul(numberOfResourceInstances)
    .mul(n)
    .mul(numberOfExecutions)
    .toNumber();
const heavyCost = (numberOfResourceInstances, n, numberOfExecutions) =>
  new BigNumber(0.15)
    .mul(100)
    .mul(numberOfResourceInstances)
    .mul(n)
    .mul(numberOfExecutions)
    .toNumber();

const windows = (obj) => {
  const timewindows = [];
  for (let i = 0; i < 5; i++) timewindows.push([obj]);
  return timewindows;
};
const resourceWindow = (numberOfResourceInstances, numberOfUsageDocs, s, m, numberOfExecutions, fn) => {
  return windows({
    charge: fn(numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions)
  });
};
const planWindow = (numberOfResourceInstances, numberOfUsageDocs, s, m, numberOfExecutions, fn) => {
  return windows({
    quantity: new BigNumber(m).mul(s).mul(numberOfExecutions).toNumber(),
    summary: new BigNumber(m).mul(s).mul(numberOfExecutions).toNumber(),
    cost: fn(numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions),
    charge: fn(numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions)
  });
};
const chargeWindow = (numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions) => {
  return windows({
    charge: new BigNumber(storageCost(numberOfResourceInstances))
      .add(lightCost(numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions))
      .add(heavyCost(numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions))
      .toNumber()
  });
};

const startTime = moment.now();

const resourceInstanceId = (orgId, resourceInstance) => [orgId, resourceInstance + 1].join('-');
const orgId = (organization, timestamp) =>
  timestamp
    ? `${uuid.v4()}-${startTime}-${organization + 1}`
    : `org-${organization + 1}`;

const usageTemplate = (orgId, resourceInstance, documentNumber, delta) => {
  return {
    start: moment.now() + delta + documentNumber,
    end: moment.now() + delta + documentNumber,
    organization_id: orgId,
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    resource_id: 'object-storage',
    plan_id: 'basic',
    resource_instance_id: resourceInstanceId(orgId, resourceInstance),
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
  };
};

// Return the expected usage report for the test organization
const report = (orgId, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions) => ({
  organization_id: orgId,
  account_id: '1234',
  windows: chargeWindow(numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions),
  resources: [
    {
      resource_id: 'object-storage',
      windows: chargeWindow(numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions),
      aggregated_usage: [
        {
          metric: 'storage',
          windows: resourceWindow(
            numberOfResourceInstances,
            numberOfUsageDocs,
            numberOfResourceInstances,
            1,
            numberOfExecutions,
            storageCost
          )
        },
        {
          metric: 'thousand_light_api_calls',
          windows: resourceWindow(
            numberOfResourceInstances,
            numberOfUsageDocs,
            numberOfResourceInstances * numberOfUsageDocs,
            1,
            numberOfExecutions,
            lightCost
          )
        },
        {
          metric: 'heavy_api_calls',
          windows: resourceWindow(
            numberOfResourceInstances,
            numberOfUsageDocs,
            numberOfResourceInstances * numberOfUsageDocs,
            100,
            numberOfExecutions,
            heavyCost
          )
        }
      ],
      plans: [
        {
          plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
          metering_plan_id: 'basic-object-storage',
          rating_plan_id: 'object-rating-plan',
          pricing_plan_id: 'object-pricing-basic',
          windows: chargeWindow(
            numberOfResourceInstances,
            numberOfUsageDocs,
            numberOfExecutions
          ),
          aggregated_usage: [
            {
              metric: 'storage',
              windows: planWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfResourceInstances,
                1,
                1,
                storageCost
              )
            },
            {
              metric: 'thousand_light_api_calls',
              windows: planWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfResourceInstances * numberOfUsageDocs,
                1,
                numberOfExecutions,
                lightCost
              )
            },
            {
              metric: 'heavy_api_calls',
              windows: planWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfResourceInstances * numberOfUsageDocs,
                100,
                numberOfExecutions,
                heavyCost
              )
            }
          ]
        }
      ]
    }
  ],
  spaces: [
    {
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      windows: chargeWindow(
        numberOfResourceInstances,
        numberOfUsageDocs,
        numberOfExecutions
      ),
      resources: [
        {
          resource_id: 'object-storage',
          windows: chargeWindow(
            numberOfResourceInstances,
            numberOfUsageDocs,
            numberOfExecutions
          ),
          aggregated_usage: [
            {
              metric: 'storage',
              windows: resourceWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfResourceInstances,
                1,
                numberOfExecutions,
                storageCost
              )
            },
            {
              metric: 'thousand_light_api_calls',
              windows: resourceWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfResourceInstances * numberOfUsageDocs,
                1,
                numberOfExecutions,
                lightCost
              )
            },
            {
              metric: 'heavy_api_calls',
              windows: resourceWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfResourceInstances * numberOfUsageDocs,
                100,
                numberOfExecutions,
                heavyCost
              )
            }
          ],
          plans: [
            {
              plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              windows: chargeWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfExecutions
              ),
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: planWindow(
                    numberOfResourceInstances,
                    numberOfUsageDocs,
                    numberOfResourceInstances,
                    1,
                    1,
                    storageCost
                  )
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: planWindow(
                    numberOfResourceInstances,
                    numberOfUsageDocs,
                    numberOfResourceInstances * numberOfUsageDocs,
                    1,
                    numberOfExecutions,
                    lightCost
                  )
                },
                {
                  metric: 'heavy_api_calls',
                  windows: planWindow(
                    numberOfResourceInstances,
                    numberOfUsageDocs,
                    numberOfResourceInstances * numberOfUsageDocs,
                    100,
                    numberOfExecutions,
                    heavyCost
                  )
                }
              ]
            }
          ]
        }
      ],
      consumers: [
        {
          consumer_id: 'UNKNOWN',
          windows: chargeWindow(
            numberOfResourceInstances,
            numberOfUsageDocs,
            numberOfExecutions,
          ),
          resources: [
            {
              resource_id: 'object-storage',
              windows: chargeWindow(
                numberOfResourceInstances,
                numberOfUsageDocs,
                numberOfExecutions,
              ),
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: resourceWindow(
                    numberOfResourceInstances,
                    numberOfUsageDocs,
                    numberOfResourceInstances,
                    1,
                    numberOfExecutions,
                    storageCost
                  )
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: resourceWindow(
                    numberOfResourceInstances,
                    numberOfUsageDocs,
                    numberOfResourceInstances * numberOfUsageDocs,
                    1,
                    numberOfExecutions,
                    lightCost
                  )
                },
                {
                  metric: 'heavy_api_calls',
                  windows: resourceWindow(
                    numberOfResourceInstances,
                    numberOfUsageDocs,
                    numberOfResourceInstances * numberOfUsageDocs,
                    100,
                    numberOfExecutions,
                    heavyCost
                  )
                }
              ],
              plans: [
                {
                  plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
                  metering_plan_id: 'basic-object-storage',
                  rating_plan_id: 'object-rating-plan',
                  pricing_plan_id: 'object-pricing-basic',
                  windows: chargeWindow(
                    numberOfResourceInstances,
                    numberOfUsageDocs,
                    numberOfExecutions
                  ),
                  aggregated_usage: [
                    {
                      metric: 'storage',
                      windows: planWindow(
                        numberOfResourceInstances,
                        numberOfUsageDocs,
                        numberOfResourceInstances,
                        1,
                        1,
                        storageCost
                      )
                    },
                    {
                      metric: 'thousand_light_api_calls',
                      windows: planWindow(
                        numberOfResourceInstances,
                        numberOfUsageDocs,
                        numberOfResourceInstances * numberOfUsageDocs,
                        1,
                        numberOfExecutions,
                        lightCost
                      )
                    },
                    {
                      metric: 'heavy_api_calls',
                      windows: planWindow(
                        numberOfResourceInstances,
                        numberOfUsageDocs,
                        numberOfResourceInstances * numberOfUsageDocs,
                        100,
                        numberOfExecutions,
                        heavyCost
                      )
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

// Print the number of usage docs already processed given a get report
// response, determined from the aggregated usage quantity found in the
// report for our test resource
const processed = (val) => {
  try {
    return val.body.resources[0].plans[0].aggregated_usage[1].windows[4][0].summary;
  } catch (e) {
    // The response doesn't contain a valid report
    return 0;
  }
};

// Fix up the usage time windows, only keep the month window
// as we may cross the boundaries of the smaller windows during
// the execution of the test
const fixup = (val) => {
  if (!val) return val;
  if (val.windows) val.windows = [[first(last(val.windows))]];
  each(keys(val), (k) => {
    if (typeof val[k] === 'object') fixup(val[k]);
    if (Array.isArray(val[k])) each(val[k], fixup);
  });
  return val;
};

module.exports.usageTemplate = usageTemplate;
module.exports.report = report;
module.exports.processed = processed;
module.exports.fixup = fixup;
module.exports.orgId = orgId;
