'use strict';

const Application = require('abacus-bridge');
const retry = require('abacus-retry');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');

const config = require('./config');
const createServiceFilter = require('./service-filter');
const convertEvent = require('./service-event-converter');
const createServiceEventsURL = require('./service-events-url');
const createServiceGuidClient = require('./service-guid-client');

const debug = require('abacus-debug')('abacus-cf-services');
const edebug = require('abacus-debug')('e-abacus-cf-services');

const extractGuids = (services) => Object.keys(services).map((key) => services[key].guid);

const injectServiceGuids =
  yieldable((apiUrl, services, cfAdminToken, cb) => {
    const client = createServiceGuidClient(apiUrl, cfAdminToken);

    const retryInjectGuids = retry(client.injectGuids, retry.forever);
    retryInjectGuids(services, cb);
  });

class ServiceBridgeApplication extends Application {
  constructor() {
    super();
    this.serviceCfg = config.loadFromEnvironment();
  }

  *getProgressDocumentId() {
    return 'abacus-cf-services-cache';
  }

  *getCollectorTokenScopes() {
    return ['abacus.usage.write', 'abacus.usage.read'];
  }

  *createEventConverter() {
    return convertEvent;
  }

  *createEventFilters(cfg) {
    const filters = yield super.createEventFilters(cfg);
    if (this.serviceCfg.services) filters.push(createServiceFilter(this.serviceCfg.services));
    return filters;
  }

  *createEventReaderURLFactory() {
    const uris = urienv({
      api: 80
    });

    const services = this.serviceCfg.services;
    yield injectServiceGuids(uris.api, services, this.cfAdminToken);
    const serviceGuids = extractGuids(services);

    return (guid) => {
      return createServiceEventsURL(uris.api, {
        serviceGuids,
        afterGuid: guid
      });
    };
  }
}

const runCLI = () => {
  const app = new ServiceBridgeApplication();
  app.run((err) => {
    if (err) {
      edebug('Failed to initialize service bridge: ', err);
      throw err;
    } else debug('Service bridge initialized!');
  });
};

module.exports.runCLI = runCLI;
