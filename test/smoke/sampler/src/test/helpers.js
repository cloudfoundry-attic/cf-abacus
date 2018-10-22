'use strict';

const util = require('util');
const request = require('request');
const { omit } = require('underscore');

const oauth = require('abacus-oauth');

const { env, spanConfig } = require('./config');

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

module.exports = {
  startTokens,
  reportClient,
  createEventBuilder,
  createSamplerClient
};
