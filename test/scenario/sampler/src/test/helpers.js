'use strict';

const util = require('util');
const request = require('request');
const { omit } = require('underscore');

const oauth = require('abacus-oauth');

const { env } = require('./env-config');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

const systemToken = env.secured ?
  oauth.cache(env.api, env.systemClientId, env.systemClientSecret, 'abacus.usage.read abacus.usage.write') :
  undefined;
const samplerToken = env.secured ?
  oauth.cache(env.api, env.clientId, env.clientSecret, 'abacus.sampler.write') :
  undefined;

const authHeader = (token) => token ? { authorization: token() } : {};

const startTokens = async() => {
  const startSystemToken = util.promisify(systemToken.start);
  const startSamplerToken = util.promisify(samplerToken.start);

  await startSystemToken();
  await startSamplerToken();
};

const createEventBuilder = () => {
  const _getEvent = (target, timestamp) => ({
    timestamp,
    organization_id: target.organization_id,
    space_id: target.space_id,
    consumer_id: target.consumer_id,
    resource_id: target.resource_id,
    plan_id: target.plan_id,
    resource_instance_id: target.resource_instance_id,
    measured_usage: []
  });

  return {
    createStartEvent: (target, timestamp) => _getEvent(target, timestamp),
    createStopEvent: (target, timestamp) => omit(_getEvent(target, timestamp), 'measured_usage')
  };
};

const createSamplerClient = () => {
  const _postToSampler = async(endpoint, payload) => await doPost(endpoint, {
    baseUrl: env.receiverUrl,
    json: payload,
    headers: authHeader(samplerToken),
    rejectUnauthorized: !env.skipSSL
  });

  return {
    stopSampling: async(event) => {
      return await _postToSampler('/v1/events/stop', event);
    },
    startSampling: async(event) => {
      return await _postToSampler('/v1/events/start', event);
    },
    createMapping: async(json) => await _postToSampler('/v1/mappings', json)
  };
};

const reportClient = {
  getReport: async(orgId, time) => {
    const res = await doGet(`/v1/metering/organizations/${orgId}/aggregated/usage/${time}`, {
      baseUrl: env.reportingUrl,
      headers: authHeader(systemToken),
      rejectUnauthorized: !env.skipSSL
    });
    return res;
  }
};

const createReportParser = (report) => {
  const _currentMonthIndex = 0;
  const _prevMonthIndex = 1;

  const _getMonthlySummaryValue = (monthIndex) => {
    const resourceIndex = 0;
    const aggrUsageMetricIndex = 0;
    const monthWindowIndex = 4;
    const parsedReport = JSON.parse(report);

    const monthWindow = parsedReport
      .resources[resourceIndex]
      .aggregated_usage[aggrUsageMetricIndex]
      .windows[monthWindowIndex][monthIndex];

    return monthWindow ? monthWindow.summary : 0;
  };

  return {
    getCurrentMonthSummary: () => _getMonthlySummaryValue(_currentMonthIndex),
    getPrevMonthSummary: () => _getMonthlySummaryValue(_prevMonthIndex)
  };
};

module.exports = {
  startTokens,
  reportClient,
  createReportParser,
  createEventBuilder,
  createSamplerClient
};
