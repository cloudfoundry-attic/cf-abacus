'use strict';

const util = require('util');
const request = require('request');
const { omit } = require('underscore');

const oauth = require('abacus-oauth');
const moment = require('abacus-moment');

const { env } = require('./env-config');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

const systemToken = env.secured ? 
  oauth.cache(env.api, env.systemClientId, env.systemClientSecret, 'abacus.usage.read abacus.usage.write') : 
  undefined;
const samplerToken = env.secured ? 
  oauth.cache(env.api, env.clientId, env.clientSecret, 'abacus.sampler.usage.write') : 
  undefined;

const authHeader = (token) => token ? { authorization: token() } : {};

const startTokens = async() => {
  const startSystemToken = util.promisify(systemToken.start);
  const startSamplerToken = util.promisify(samplerToken.start);

  await startSystemToken();
  await startSamplerToken();
};

const createEventBuilder = () => {
  const getEvent = (orgId, time) => ({
    timestamp: time,
    organization_id: orgId,
    space_id: 'bcedeb4a-641e-4d80-9e35-435cbaf79d5c',
    consumer_id: '92d9ef8b-fd71-46d7-b460-e64f44e18f18',
    resource_id: 'sampler-postgresql',
    plan_id: 'v9.4-large',
    resource_instance_id: '2249be66-9f05-4525-a09e-955ae2ab53c1',
    measured_usage: []
  }); 

  return {
    startEvent: (orgId, time) => getEvent(orgId, time),
    stopEvent: (orgId, time) => omit(getEvent(orgId, time), 'measured_usage')
  };
};

const createSamplerClient = () => {
  const stopEndpoint = '/v1/events/stop';
  const startEndpoint = '/v1/events/start';
  const mappingEndpoint = '/v1/mappings';

  const postToSampler = async(endpoint, payload) => await doPost(endpoint, {
    baseUrl: env.receiverUrl,
    json: payload,
    headers: authHeader(samplerToken),
    rejectUnauthorized: !env.skipSSL
  });

  return {
    stop: async(event) => {
      return await postToSampler(stopEndpoint, event);
    },
    start: async(event) => {
      return await postToSampler(startEndpoint, event);
    },
    createMapping: async(json) => await postToSampler(mappingEndpoint, json)
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

const log = (res) => {
  console.log(`${moment.utc().toDate()}: ${res.request.method} to ${res.request.path}: response ${res.statusCode}`);
  return res;
};

module.exports = { 
  log,
  startTokens,
  reportClient,
  createEventBuilder,
  createSamplerClient
};
