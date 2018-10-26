'use strict';

const util = require('util');
const request = require('request');
const { omit } = require('underscore');

const { env, spanConfig } = require('./config');

const doGet = util.promisify(request.get);

const createEventBuilder = () => {
  const _getEvent = (time) => ({
    timestamp: time,
    organization_id: spanConfig.organization_id,
    space_id: spanConfig.space_id,
    consumer_id: spanConfig.consumer_id,
    resource_id: spanConfig.resource_id,
    plan_id: spanConfig.plan_id,
    resource_instance_id: spanConfig.resource_instance_id,
    measured_usage: []
  });

  return {
    createStartEvent: (time) => _getEvent(time),
    createStopEvent: (time) => omit(_getEvent(time), 'measured_usage')
  };
};

const reportClient = {
  getReport: async(authHeader, orgId, time) => {
    const res = await doGet(`/v1/metering/organizations/${orgId}/aggregated/usage/${time}`, {
      baseUrl: env.reportingUrl,
      headers: {
        authorization: authHeader
      },
      rejectUnauthorized: !env.skipSSL
    });
    return res;
  }
};

module.exports = {
  reportClient,
  createEventBuilder
};
