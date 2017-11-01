'use strict';

const express = require('abacus-express');
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

module.exports = () => {
  let app;
  let server;

  let events;
  let guids;
  let receivedRequestCount = 0;
  let receivedServiceUsageEventsOAuthToken;
  let receivedServicesOAuthToken;

  const start = () => {
    app = express();

    app.get('/v2/service_usage_events', (req, res) => {
      console.log('Retrieved service usage events. Returning: %j', events);
      receivedRequestCount++;
      receivedServiceUsageEventsOAuthToken = extractOAuthToken(req.header('Authorization'));
      res.send({
        resources: events
      });
    });

    app.get('/v2/services', (req, res) => {
      // save request's query params and validate them
      const services = convert(guids);
      receivedServicesOAuthToken = extractOAuthToken(req.header('Authorization'));
      console.log('Retrieved request for services. Returning: %j', services);
      res.send(services);
    });


    server = app.listen(randomPort);
    return server.address();
  };

  const stop = (cb) => {
    server.close(cb);
  };

  // TODO: review
  // in order to work this must be called after "start"
  const returnEvents = (sendEvents) => {
    events = sendEvents;
  };

  const returnServiceGuids = (serviceGuids) => {
    guids = serviceGuids;
  };

  const getReceivedServiceUsageEventsOAuthToken = () => {
    return receivedServiceUsageEventsOAuthToken;
  };

  const getReceivedServicesOAuthToken = () => {
    return receivedServicesOAuthToken;
  };

  const getReceivedRequetsCount = () => {
    return receivedRequestCount;
  };

  return {
    start,
    returnEvents,
    returnServiceGuids,
    getReceivedRequetsCount,
    getReceivedServiceUsageEventsOAuthToken,
    getReceivedServicesOAuthToken,
    stop
  };
};
