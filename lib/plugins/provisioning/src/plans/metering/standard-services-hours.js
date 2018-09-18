'use strict';

/* istanbul ignore file */

module.exports = {
  plan_id: 'standard-services-hours',
  measures: [
    {
      name: 'duration',
      unit: 'MILLISECONDS'
    }
  ],
  metrics: [
    {
      name: 'usage_hours',
      unit: 'USAGEHOURS',
      type: 'discrete',
      meter: ((m) => new BigNumber(m.duration).div(3600000).toNumber()).toString()
    }
  ]
};
