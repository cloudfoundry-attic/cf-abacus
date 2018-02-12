'use strict';
const _ = require('underscore');
const moment = require('abacus-moment');


const convertMeasures = (measures) => {
  return _.map(measures, (measure) => {
    return _.extend({ measure: measure.name },
      { quantity: '100' });
  });
};

module.exports = (plan,request) => {
  let measures = plan.measures;
  let date = moment.utc().valueOf();
  let sampleDoc = {
    start: date,
    end: date,
    organization_id: 'idz:sampleIdentityZoneId',
    space_id: 'sampleSpaceId',
    consumer_id: 'sampleConsumerId',
    resource_id: `${request.session.creds.resource_id}`,
    plan_id: 'standard',
    resource_instance_id: 'sampleResourceInstanceId',
    measured_usage: convertMeasures(measures)
  };

  return sampleDoc;
};
