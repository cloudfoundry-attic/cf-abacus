'use strict';

const Application = require('abacus-bridge');
const createAppEventsURL = require('./app-events-url');
const convertEvent = require('./app-event-converter');

const debug = require('abacus-debug')('abacus-cf-applications');
const edebug = require('abacus-debug')('e-abacus-cf-applications');

class AppBridgeApplication extends Application {
  constructor() {
    super();
  }

  *getProgressDocumentId() {
    return 'abacus-cf-bridge-cache';
  }

  *getCollectorTokenScopes() {
    return [
      'abacus.usage.linux-container.write',
      'abacus.usage.linux-container.read'
    ];
  }

  *createEventConverter() {
    return convertEvent;
  }

  *createEventReaderURLFactory() {
    return (guid) => {
      return createAppEventsURL({
        afterGuid: guid
      });
    };
  }
}

const runCLI = () => {
  const app = new AppBridgeApplication();
  app.run((err) => {
    if (err) {
      edebug('Failed to initialize application bridge: ', err);
      throw err;
    }
    else
      debug('Application bridge initialized!');
  });
};

module.exports.runCLI = runCLI;
