'use strict';

const { each, last, first, keys } = require('underscore');

const uuid = require('uuid');

const moment = require('abacus-moment');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

// Compute the test costs
const storageCost = (planType, numberOfResourceInstances) =>
  new BigNumber(planType === 'basic' ? 1.0 : 0.5)
    .mul(numberOfResourceInstances)
    .toNumber();
const lightCost = (planType, numberOfResourceInstances, n, numberOfExecutions) =>
  new BigNumber(planType === 'basic' ? 0.03 : 0.04)
    .mul(numberOfResourceInstances)
    .mul(n)
    .mul(numberOfExecutions)
    .toNumber();
const heavyCost = (planType, numberOfResourceInstances, n, numberOfExecutions) =>
  new BigNumber(planType === 'basic' ? 0.15 : 0.18)
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
const resourceWindow = (planType, numberOfResourceInstances, numberOfUsageDocs, s, m, numberOfExecutions, fn) => {
  return windows({
    charge: fn(planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions)
  });
};
const planWindow = (planType, numberOfResourceInstances, numberOfUsageDocs, s, m, numberOfExecutions, fn) => {
  return windows({
    quantity: new BigNumber(m).mul(s).mul(numberOfExecutions).toNumber(),
    summary: new BigNumber(m).mul(s).mul(numberOfExecutions).toNumber(),
    cost: fn(planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions),
    charge: fn(planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions)
  });
};
const chargeWindow = (planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions) => {
  return windows({
    charge: new BigNumber(storageCost(planType, numberOfResourceInstances))
      .add(lightCost(planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions))
      .add(heavyCost(planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions))
      .toNumber()
  });
};

const startTime = moment.now();

const resourceInstanceId = (orgId, resourceInstance) => [orgId, resourceInstance + 1].join('-');
const orgId = (organization, timestamp) =>
  timestamp
    ? `${uuid.v4()}-${startTime}-${organization + 1}`
    : `org-${organization + 1}`;

const usageTemplate = (orgId, resourceInstance, documentNumber, planType, delta) => {
  return {
    start: moment.now() + delta + documentNumber,
    end: moment.now() + delta + documentNumber,
    organization_id: orgId,
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    resource_id: 'object-storage',
    plan_id: planType,
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

const planUsage = (planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions) => ({
  plan_id: `${planType}/${planType}-object-storage/object-rating-plan/object-pricing-${planType}`,
  metering_plan_id: `${planType}-object-storage`,
  rating_plan_id: 'object-rating-plan',
  pricing_plan_id: `object-pricing-${planType}`,
  windows: chargeWindow(
    planType,
    numberOfResourceInstances,
    numberOfUsageDocs,
    numberOfExecutions
  ),
  aggregated_usage: [
    {
      metric: 'storage',
      windows: planWindow(
        planType,
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
        planType,
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
        planType,
        numberOfResourceInstances,
        numberOfUsageDocs,
        numberOfResourceInstances * numberOfUsageDocs,
        100,
        numberOfExecutions,
        heavyCost
      )
    }
  ]
});

// Return the expected usage report for the test organization
const report = (orgId, planType, numberOfResourceInstances, numberOfUsageDocs, numberOfExecutions) => {
  const chargeWindows = chargeWindow(
    planType,
    numberOfResourceInstances,
    numberOfUsageDocs,
    numberOfExecutions
  );
  const storageWindow = resourceWindow(
    planType,
    numberOfResourceInstances,
    numberOfUsageDocs,
    numberOfResourceInstances,
    1,
    numberOfExecutions,
    storageCost
  );
  const lightAPIWindow = resourceWindow(
    planType,
    numberOfResourceInstances,
    numberOfUsageDocs,
    numberOfResourceInstances * numberOfUsageDocs,
    1,
    numberOfExecutions,
    lightCost
  );
  const heavyAPIWindow = resourceWindow(
    planType,
    numberOfResourceInstances,
    numberOfUsageDocs,
    numberOfResourceInstances * numberOfUsageDocs,
    100,
    numberOfExecutions,
    heavyCost
  );
  const planUsageData = planUsage(
    planType,
    numberOfResourceInstances,
    numberOfUsageDocs,
    numberOfExecutions
  );

  return {
    organization_id: orgId,
    account_id: '1234',
    windows: chargeWindows,
    resources: [
      {
        resource_id: 'object-storage',
        windows: chargeWindows,
        aggregated_usage: [
          {
            metric: 'storage',
            windows: storageWindow
          },
          {
            metric: 'thousand_light_api_calls',
            windows: lightAPIWindow
          },
          {
            metric: 'heavy_api_calls',
            windows: heavyAPIWindow
          }
        ],
        plans: [
          planUsageData
        ]
      }
    ],
    spaces: [
      {
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        windows: chargeWindows,
        resources: [
          {
            resource_id: 'object-storage',
            windows: chargeWindows,
            aggregated_usage: [
              {
                metric: 'storage',
                windows: storageWindow
              },
              {
                metric: 'thousand_light_api_calls',
                windows: lightAPIWindow
              },
              {
                metric: 'heavy_api_calls',
                windows: heavyAPIWindow
              }
            ],
            plans: [
              planUsageData
            ]
          }
        ],
        consumers: [
          {
            consumer_id: 'UNKNOWN',
            windows: chargeWindows,
            resources: [
              {
                resource_id: 'object-storage',
                windows: chargeWindows,
                aggregated_usage: [
                  {
                    metric: 'storage',
                    windows: storageWindow
                  },
                  {
                    metric: 'thousand_light_api_calls',
                    windows: lightAPIWindow
                  },
                  {
                    metric: 'heavy_api_calls',
                    windows: heavyAPIWindow
                  }
                ],
                plans: [
                  planUsageData
                ]
              }
            ]
          }
        ]
      }
    ]
  };
};

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
