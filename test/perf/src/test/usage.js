'use strict';

const { each, last, first, keys } = require('underscore');

const moment = require('abacus-moment');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

// Compute the test costs
const storageCost = (nri, n) => new BigNumber(1.0).mul(nri).toNumber();
const lightCost = (nri, n) =>
  new BigNumber(0.03)
    .mul(nri)
    .mul(n)
    .toNumber();
const heavyCost = (nri, n) =>
  new BigNumber(0.15)
    .mul(100)
    .mul(nri)
    .mul(n)
    .toNumber();

const windows = (obj) => {
  const timewindows = [];
  for (let i = 0; i < 5; i++) timewindows.push([obj]);
  return timewindows;
};
const rwindow = (nri, n, s, m, fn) => {
  return windows({
    charge: fn(nri, n)
  });
};
const pwindow = (nri, n, s, m, fn) => {
  return windows({
    quantity: new BigNumber(m).mul(s).toNumber(),
    summary: new BigNumber(m).mul(s).toNumber(),
    cost: fn(nri, n),
    charge: fn(nri, n)
  });
};
const cwindow = (nri, n) => {
  return windows({
    charge: new BigNumber(storageCost(nri, n))
      .add(lightCost(nri, n))
      .add(heavyCost(nri, n))
      .toNumber()
  });
};

const timestamp = moment.now();

const resourceInstanceId = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87', o + 1, ri + 1].join('-');
const orgId = (o) => ['org', timestamp, o + 1].join('-');

const usageTemplate = (o, ri, i, delta) => ({
  start: moment.now() + delta + i,
  end: moment.now() + delta + i,
  organization_id: orgId(o),
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  resource_id: 'object-storage',
  plan_id: 'basic',
  resource_instance_id: resourceInstanceId(o, ri),
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

// Return the expected usage report for the test organization
const report = (o, nri, n) => ({
  organization_id: orgId(o),
  account_id: '1234',
  windows: cwindow(nri, n),
  resources: [
    {
      resource_id: 'object-storage',
      windows: cwindow(nri, n),
      aggregated_usage: [
        {
          metric: 'storage',
          windows: rwindow(nri, n, nri, 1, storageCost)
        },
        {
          metric: 'thousand_light_api_calls',
          windows: rwindow(nri, n, nri * n, 1, lightCost)
        },
        {
          metric: 'heavy_api_calls',
          windows: rwindow(nri, n, nri * n, 100, heavyCost)
        }
      ],
      plans: [
        {
          plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
          metering_plan_id: 'basic-object-storage',
          rating_plan_id: 'object-rating-plan',
          pricing_plan_id: 'object-pricing-basic',
          windows: cwindow(nri, n),
          aggregated_usage: [
            {
              metric: 'storage',
              windows: pwindow(nri, n, nri, 1, storageCost)
            },
            {
              metric: 'thousand_light_api_calls',
              windows: pwindow(nri, n, nri * n, 1, lightCost)
            },
            {
              metric: 'heavy_api_calls',
              windows: pwindow(nri, n, nri * n, 100, heavyCost)
            }
          ]
        }
      ]
    }
  ],
  spaces: [
    {
      space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
      windows: cwindow(nri, n),
      resources: [
        {
          resource_id: 'object-storage',
          windows: cwindow(nri, n),
          aggregated_usage: [
            {
              metric: 'storage',
              windows: rwindow(nri, n, nri, 1, storageCost)
            },
            {
              metric: 'thousand_light_api_calls',
              windows: rwindow(nri, n, nri * n, 1, lightCost)
            },
            {
              metric: 'heavy_api_calls',
              windows: rwindow(nri, n, nri * n, 100, heavyCost)
            }
          ],
          plans: [
            {
              plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
              metering_plan_id: 'basic-object-storage',
              rating_plan_id: 'object-rating-plan',
              pricing_plan_id: 'object-pricing-basic',
              windows: cwindow(nri, n),
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: pwindow(nri, n, nri, 1, storageCost)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: pwindow(nri, n, nri * n, 1, lightCost)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: pwindow(nri, n, nri * n, 100, heavyCost)
                }
              ]
            }
          ]
        }
      ],
      consumers: [
        {
          consumer_id: 'UNKNOWN',
          windows: cwindow(nri, n),
          resources: [
            {
              resource_id: 'object-storage',
              windows: cwindow(nri, n),
              aggregated_usage: [
                {
                  metric: 'storage',
                  windows: rwindow(nri, n, nri, 1, storageCost)
                },
                {
                  metric: 'thousand_light_api_calls',
                  windows: rwindow(nri, n, nri * n, 1, lightCost)
                },
                {
                  metric: 'heavy_api_calls',
                  windows: rwindow(nri, n, nri * n, 100, heavyCost)
                }
              ],
              plans: [
                {
                  plan_id: 'basic/basic-object-storage/' + 'object-rating-plan/object-pricing-basic',
                  metering_plan_id: 'basic-object-storage',
                  rating_plan_id: 'object-rating-plan',
                  pricing_plan_id: 'object-pricing-basic',
                  windows: cwindow(nri, n),
                  aggregated_usage: [
                    {
                      metric: 'storage',
                      windows: pwindow(nri, n, nri, 1, storageCost)
                    },
                    {
                      metric: 'thousand_light_api_calls',
                      windows: pwindow(nri, n, nri * n, 1, lightCost)
                    },
                    {
                      metric: 'heavy_api_calls',
                      windows: pwindow(nri, n, nri * n, 100, heavyCost)
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