'use strict';

const urienv = require('abacus-urienv');

const loadOAuthFromEnvironment = () => {
  return {
    enabled: process.env.SECURED === 'true',
    jwtKey: process.env.JWTKEY,
    jwtAlgorithm: process.env.JWTALGO
  };
};

const loadCFFromEnvironment = () => {
  const uris = urienv({
    auth_server: 9882
  });
  return {
    url: uris.auth_server,
    clientID: process.env.CF_CLIENT_ID,
    clientSecret: process.env.CF_CLIENT_SECRET
  };
};

const loadCollectorFromEnvironment = () => {
  return {
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET
  };
};

const loadDBFromEnvironment = () => {
  const alias = process.env.DBALIAS || 'db';
  const uris = urienv({
    [alias]: 5984
  });
  return {
    url: uris[alias]
  };
};

const loadPollingFromEnvironment = () => {
  const minPollInterval = parseInt(process.env.MIN_INTERVAL_TIME) || 5000;
  const maxPollInterval = parseInt(process.env.MAX_INTERVAL_TIME) || 240000;
  const allowedOrgs = process.env.ORGS_TO_REPORT
    ? JSON.parse(process.env.ORGS_TO_REPORT)
    : undefined;

  return {
    minInterval: minPollInterval,
    maxInterval: maxPollInterval,
    orgs: allowedOrgs,
    events: {
      minAge: parseInt(process.env.GUID_MIN_AGE) || 60000,
      lastKnownGUID: process.env.LAST_RECORDED_GUID
    }
  };
};

const loadFromEnvironment = () => {
  return {
    oauth: loadOAuthFromEnvironment(),
    cf: loadCFFromEnvironment(),
    collector: loadCollectorFromEnvironment(),
    db: loadDBFromEnvironment(),
    polling: loadPollingFromEnvironment()
  };
};

module.exports.loadFromEnvironment = loadFromEnvironment;
