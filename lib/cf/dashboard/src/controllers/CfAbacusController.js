'use strict';
/* eslint-disable max-len*/
const logger = require('../utils/dashboardLogger');
const HttpClient = require('../utils/HttpClient');
const helper = require('../utils/HttpClientHelper');
const config = require('../config');
const Promise = require('bluebird');
const _ = require('lodash');
const usageDoc = require('../utils/usageDoc');
const debug = require('abacus-debug')('abacus-dashboard');


class CfAbacusController {
  constructor() {
    this.httpClient = new HttpClient();
  }

  getMeteringPlan(req) {
    logger.debug('CfAbacusController:: Fetching metering plan');
    let url = `${config.uris().provisioning}/v1/metering/plans/${req.params.plan_id}`;
    return this.httpClient.request(helper.generateRequestObject('GET', url, req.session.abacus_token));
  }

  updateMeteringPlan(req) {
    logger.debug('CfAbacusController:: updating metering plan');
    let url = `${config.uris().provisioning}/v1/metering/plan/${req.params.plan_id}`;
    return this.httpClient.request(helper.generateRequestObject('PUT', url, req.session.abacus_token, req.body));
  }

  updateAllPlans(req) {
    logger.debug('CfAbacusController:: updating all plans');
    return this.updateMeteringPlan(req);
  }

  getUsageDocument(request) {
    debug('CfAbacusController: get usage document called');
    return Promise.try(() => {
      return this.getMeteringPlan(request)
        .then((resp) => {
          return usageDoc(resp.body, request);
        });
    });
  }

  postUsageDocument(request) {
    debug('CfAbacusController:: post usagedocument called');
    let url = request.session.creds.collector_url;
    return Promise.try(() => {
      return this.httpClient.request(helper.generateRequestObject('POST', url, request.session.abacus_token, request.body))
        .then((response) => {
          let obj = {};
          obj.headers = {};
          obj.headers = _.pick(response.headers, 'location');
          return _.extend(obj, _.pick(response, 'statusCode', 'statusMessage', 'body'));
        });
    });
  }
}

module.exports = CfAbacusController;
