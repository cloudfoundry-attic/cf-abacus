'use strict';

const { extend, object, map } = require('underscore');
const util = require('util');

const debug = require('abacus-debug')('abacus-usage-metering-meter');
const edebug = require('abacus-debug')('e-abacus-usage-metering-meter');

const measures = (mu) => {
  return object(map(mu, (m) => [m.measure, m.quantity]));
};

class Meter {

  constructor(client, systemToken) {
    this.getPlan = util.promisify(client.plan);
    this.systemToken = systemToken;
  }

  async meterUsage(usageDoc) {
    debug('Usage %o', usageDoc);

    const meterInput = extend({}, measures(usageDoc.measured_usage), {
      start: usageDoc.start,
      end: usageDoc.end
    });

    let meteringPlan;
    try {
      meteringPlan = await this.getPlan(usageDoc.metering_plan_id, this.systemToken);
    } catch(err) {
      edebug('Failed to read metering plan due to: %o', err);

      return extend({}, usageDoc, {
        error: 'INTERNAL_SERVER_ERROR'
      });
    }

    if(meteringPlan && meteringPlan.error)
      return extend({}, usageDoc, meteringPlan);

    const meteredDoc = extend({}, usageDoc, {
      metered_usage: map(meteringPlan.metrics, (metric) => ({
        metric: metric.name,
        quantity: metric.meterfn(meterInput)
      }))
    });

    debug('Metered usage %o', meteredDoc);
    return meteredDoc;
  };
}

module.exports = Meter;
