'use strict';

const express = require('abacus-express');
const debug = require('abacus-debug')('cloud-controller-mock');
const randomPort = 0;

const convert = (serviceGuids) => {
  const resources = [];
  Object.keys(serviceGuids).forEach((serviceLabel) => {
    resources.push({
      entity: {
        label: serviceLabel
      },
      metadata: {
        guid: serviceGuids[serviceLabel]
      }
    });
  });
  return {
    resources
  };
};

// OAuth Authorization header format: "Bearer <token-value>"
const extractOAuthToken = (authHeader) => {
  if (authHeader)
    return authHeader.split(' ')[1];

  return undefined;
};

// Filter format is "label IN <label1,label2>"
const extractServiceLabels = (filter) => {
  return filter.substring('label IN '.length).split(',');
};

// Filter format is array of
// [ 'service_instance_type:managed_service_instance',
// 'service_guid IN test-service-guid,test-service-guid2' ]
const extractServiceGuids = (filter) => {
  return filter[1].substring('service_guid IN '.length).split(',');
};

module.exports = () => {
  let app;
  let server;

  const serviceUsageEvents = {
    return: undefined,
    requests:[],
    receivedToken: undefined,
    receivedServiceGuids: undefined,
    receivedAfterGuid: [],
    requestsCount: 0
  };

  const serviceGuidsData = {
    return: undefined,
    receivedToken: undefined,
    recievedServiceLabels: undefined,
    requestsCount: 0
  };

  const start = () => {
    app = express();

    let eventsReturned = false;
    app.get('/v2/service_usage_events', (req, res) => {
      debug('Retrieved service usage events. Request query: %j', req.query);

      serviceUsageEvents.requests.push({
        token: extractOAuthToken(req.header('Authorization')),
        serviceGuids: extractServiceGuids(req.query.q),
        afterGuid: req.query.after_guid
      });

      res.send({
        resources: !eventsReturned ? serviceUsageEvents.return : []
      });
      eventsReturned = true;
    });

    app.get('/v2/services', (req, res) => {
      debug('Retrieved request for services. Headers: %j, Query params: %j', req.headers, req.query);

      serviceGuidsData.requestsCount++;
      serviceGuidsData.receivedToken = extractOAuthToken(req.header('Authorization'));
      serviceGuidsData.recievedServiceLabels = extractServiceLabels(req.query.q);

      const services = convert(serviceGuidsData.return);
      res.send(services);
    });


    server = app.listen(randomPort);
    return server.address();
  };

  const stop = (cb) => {
    server.close(cb);
  };

  const returnEvents = (events) => {
    serviceUsageEvents.return = events;
  };

  const returnServiceGuids = (guids) => {
    serviceGuidsData.return = guids;
  };

  const getServiceGuidsRequestsCount = () => {
    return serviceGuidsData.requestsCount;
  };

  return {
    start,
    serviceGuids: {
      return: returnServiceGuids,
      requestsCount: getServiceGuidsRequestsCount,
      received: {
        token: () => serviceGuidsData.receivedToken,
        serviceLabels: () => serviceGuidsData.recievedServiceLabels
      }
    },
    serviceUsageEvents: {
      return: returnEvents,
      requestsCount: () => serviceUsageEvents.requests.length,
      requests: (index) => serviceUsageEvents.requests[index]
    },
    stop
  };
};
