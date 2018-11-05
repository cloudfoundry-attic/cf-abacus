'use strict';

const { extend } = require('underscore');
const express = require('express');
const debug = require('abacus-debug')('cloud-controller-mock');

const createMockServiceData = require('./mock-service-data');
const createCfServerMock = require('./cf-server-mock');

// OAuth Authorization header format: "Bearer <token-value>"
const extractOAuthToken = (authHeader) => {
  if (authHeader) return authHeader.split(' ')[1];

  return undefined;
};

module.exports = () => {
  const applicationUsageEventsData = createMockServiceData();
  const cfServerMock = createCfServerMock();

  const start = (cb) => {
    const route = express.Router();

    route.get('/v2/app_usage_events', (req, res) => {
      debug('Retrieved app usage events request. Query: %j', req.query);
      applicationUsageEventsData.requests().push({
        token: extractOAuthToken(req.header('Authorization')),
        afterGuid: req.query.after_guid
      });
      const currentRequestReturn = applicationUsageEventsData.nextResponse();
      const result = currentRequestReturn || [];
      debug('Returning app usage events: %j', result);
      res.send({
        resources: result
      });
    });

    cfServerMock.additionalRoutes(route);
    cfServerMock.start(cb);
  };

  return extend({}, cfServerMock, {
    start,
    usageEvents: applicationUsageEventsData
  });
};
