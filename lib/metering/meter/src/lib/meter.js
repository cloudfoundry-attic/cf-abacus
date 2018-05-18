'use strict';

const { extend, object, map } = require('underscore');
const util = require('util');

const debug = require('abacus-debug')('abacus-usage-metering-meter');
const edebug = require('abacus-debug')('e-abacus-usage-metering-meter');

const measures = (mu) => {
  return object(map(mu, (m) => [m.measure, m.quantity]));
};

const readingPlanFailed = (causeError) => {
  const errMessage = util.format('Failed to read metering plan due to: %j', causeError);
  edebug(errMessage);
  throw new Error(errMessage);
};

class Meter {
  constructor(meteringPlanRetriever) {
    this.meteringPlanRetriever = meteringPlanRetriever;
  }

  async meterUsage(usageDoc) {
    debug('Metering normalized usage document %o', usageDoc);

    const meterInput = extend({}, measures(usageDoc.measured_usage), {
      start: usageDoc.start,
      end: usageDoc.end
    });
    let meteringPlan;
    try {
      meteringPlan = await this.meteringPlanRetriever.getPlan(usageDoc.metering_plan_id);
    } catch (err) {
      readingPlanFailed(err);
    }

    if(meteringPlan && meteringPlan.error)
      readingPlanFailed(meteringPlan.error);

    try {
      const meteredDoc = extend({}, usageDoc, {
        metered_usage: map(meteringPlan.metering_plan.metrics, (metric) => ({
          metric: metric.name,
          quantity: metric.meterfn(meterInput)
        }))
      });

      debug('Metered usage %o', meteredDoc);
      return meteredDoc;
    } catch (e) {
      edebug('Metering plan meterFn failed. Error: %o', e);
      throw extend({}, e, {
        isPlanBusinessError: true
      });
    }
  };
}

module.exports = Meter;

