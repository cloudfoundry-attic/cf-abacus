'use-strict';

const request = require('abacus-request');
const moment = require('abacus-moment');
const _ = require('underscore');
const extend = _.extend;

let provisioningUrl;
let collectorUrl;
let reportingUrl;

const getHeaders = (token) => {
  return {
    'Content-Type': 'application/json',
    'Authorization': token(),
    'cache-control': 'no-cache'
  };
};

const createPlan = (token, resourceType, planBody, callback) => {
  request.post(':provisioning_url/v1/:resource_type/plans', {
    provisioning_url: provisioningUrl,
    resource_type: resourceType,
    headers: getHeaders(token),
    body: planBody
  }, callback);
};

const updatePlan = (token, resourceType, planId, planBody, callback) => {
  request.put(':provisioning_url/v1/:resource_type/plan/:plan_id', {
    provisioning_url: provisioningUrl,
    plan_id: planId,
    resource_type: resourceType,
    headers: getHeaders(token),
    body: planBody
  }, callback);
};

const getPlan = (token, resourceType, planId, callback) => {
  request.get(':provisioning_url/v1/:resource_type/plans/:plan_id', {
    provisioning_url: provisioningUrl,
    resource_type: resourceType,
    plan_id: planId,
    headers: getHeaders(token)
  }, callback);
};

const createMapping = (token, mappingType, resourceId, planId, callback) => {
  request.post(':provisioning_url/v1/provisioning/mappings/:mapping_type' +
    '/resources/:resource_id/plans/basic/:plan_id', {
    provisioning_url: provisioningUrl,
    mapping_type: mappingType,
    resource_id: resourceId,
    plan_id: planId,
    headers: getHeaders(token)
  }, callback);
};

const getMapping = (token, mappingType, resourceId, callback) => {
  request.get(':provisioning_url/v1/provisioning/mappings/:mapping_type' +
    '/resources/:resource_id/plans/basic', {
    provisioning_url: provisioningUrl,
    mapping_type: mappingType,
    resource_id: resourceId,
    headers: getHeaders(token)
  }, callback);
};

const postUsage = (token, body, callback) => {
  request.post(':collector_url/v1/metering/collected/usage', {
    collector_url: collectorUrl,
    headers: getHeaders(token),
    body: body
  }, callback);
};

const getOrganizationUsage = (token, orgId, callback) => {
  request.get(
    ':reporting_url/v1/metering/organizations/:org_id/aggregated/usage', {
      reporting_url: reportingUrl,
      org_id: orgId,
      headers: getHeaders(token)
    }, callback);
};

const getUsage = (token, opts, callback) => {

  const url = ':reporting_url/v1/metering/' +
    'organizations/:org_id/' +
    'spaces/:space_id/' +
    'resource_id/:resource_id/' +
    'resource_instances/:resource_instance_id/' +
    'consumers/:consumer_id/' +
    'plans/:plan_id/' +
    'metering_plans/:metering_plan_id/' +
    'rating_plans/:rating_plan_id/' +
    'pricing_plans/:pricing_plan_id/' +
    't/:time_based_key/' +
    'aggregated/usage/:time';

  request.get(url, extend(opts, {
    reporting_url: reportingUrl,
    time: moment.utc().valueOf(),
    headers: getHeaders(token)
  }), callback);
};

const getTimeBasedKeyProperty = (body, filter) => {
  return body.spaces.filter((space) => {
    return space.space_id === filter.space_id;
  })[0].consumers.filter((consumer) => {
    return consumer.consumer_id === filter.consumer_id;
  })[0].resources.filter((resource) => {
    return resource.resource_id === filter.resource_id;
  })[0].plans.filter((plan) => {
    const key = filter.plan_id + '/' + filter.metering_plan_id + '/'
      + filter.rating_plan_id + '/' + filter.pricing_plan_id;
    return plan.plan_id === key;
  })[0].resource_instances[0].t;
};

module.exports = (provisioningAppUrl, collectorAppUrl, reportingAppUrl) => {
  provisioningUrl = provisioningAppUrl;
  collectorUrl = collectorAppUrl;
  reportingUrl = reportingAppUrl;

  return {
    postUsage: postUsage,
    getOrganizationUsage: getOrganizationUsage,
    getUsage: getUsage,
    createPlan: createPlan,
    updatePlan: updatePlan,
    getPlan: getPlan,
    createMapping: createMapping,
    getMapping: getMapping,
    getTimeBasedKeyProperty: getTimeBasedKeyProperty
  };
};;
