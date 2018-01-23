'use strict';

const mconfig = require('abacus-metering-config');
const util = require('util');
const { extend, object, map } = require('underscore');

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-metering-meter');
// const edebug = require('abacus-debug')('e-abacus-usage-metering-meter');

const getPlan = util.promisify(mconfig.plan);

let systemToken;

// Convert measured usage to the format expected by the meter functions
// ex: [{measure: 'm1', quantity: 1}] will be mapped to [{ m1: 1}]
const measures = (mu) => {
  return object(map(mu, (m) => [m.measure, m.quantity]));
};

const meterUsage = async(usageDoc) => {
  debug('Usage %o', usageDoc);

  // Translate the measured_usage to the measures object expected by
  // the meter function
  const meterInput = extend({}, measures(usageDoc.measured_usage), {
    start: usageDoc.start,
    end: usageDoc.end
  });

  // Retrieve the metering plan
  const meteringPlan = await getPlan(usageDoc.metering_plan_id, systemToken && systemToken());

  // Apply the configured meter functions to the measured usage to
  // produce metered usage when there is no error. Otherwise, add
  // error and reasons
  const meteredDoc = extend(
    {},
    usageDoc,
    {
      metered_usage: map(meteringPlan.metrics, (metric) => ({
        metric: metric.name,
        quantity: metric.meterfn(meterInput)
      }))
    }
  );

  debug('Metered usage %o', meteredDoc);
  return meteredDoc;
};

module.exports.meterUsage = meterUsage;
