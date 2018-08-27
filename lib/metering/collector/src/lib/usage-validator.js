'use strict';

const util = require('util');
const { extend, pick } = require('underscore');
const httpStatus = require('http-status-codes');

const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const batch = require('abacus-batch');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const schemas = require('abacus-usage-schemas');
const accountClient = require('abacus-accountclient');

const edebug = require('abacus-debug')('e-abacus-usage-collector-usage-validator');

const uris = urienv({
  provisioning: 9880
});

const brequest = retry(breaker(batch(request)));
const batchedGetRequest = util.promisify(brequest.get);

const validationError = (res, errorTextNotFound, errorTextDown) => {
  const error = new Error(errorTextNotFound);

  if (res.statusCode === 404) {
    error.badRequest = res.body && res.body.notfound === true || false;
    error.error = errorTextNotFound;
  } else {
    error.badRequest = false;
    error.error = errorTextDown;
  }

  return error;
};

const validatePlan = async(usage, auth) => {
  const o = auth ? { headers: { authorization: auth } } : {};

  const res = await batchedGetRequest(
    `${uris.provisioning}/v1/provisioning/organizations/:organization_id/spaces/:space_id/consumers/:consumer_id/` +
    'resources/:resource_id/plans/:plan_id/instances/:resource_instance_id/:time',
    extend({}, o, usage, {
      consumer_id: usage.consumer_id || 'UNKNOWN',
      time: usage.end
    }));

  if (res.statusCode !== httpStatus.OK) {
    const sanitizedResponse = pick(res, 'statusCode', 'headers', 'body');
    edebug('Usage validation failed, %o', sanitizedResponse);
    throw validationError(res, 'Invalid plan', 'Unable to retrieve metering plan');
  }
};

const validateSchema = (usage) => {
  try {
    schemas.resourceUsage.validate(usage);
  } catch (err) {
    edebug('Schema validation failed, %o', err);
    const error = new Error('Invalid schema');
    error.badRequest = true;
    error.error = 'Invalid schema';
    throw error;
  }
};

module.exports.createValidator = (unsupportedLicenses) => ({
  validate: async(usage, auth) => {
    validateSchema(usage);
    await validatePlan(usage, auth);
    await accountClient.validateAccount(usage, auth, unsupportedLicenses);
  }
});
