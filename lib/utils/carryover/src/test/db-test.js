'use strict';

const _ = require('underscore');
const extend = _.extend;
const memoize = _.memoize;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

const urienv = require('abacus-urienv');

// Resolve service URIs
const uris = memoize(() => urienv({
  api      : 80,
  collector: 9080,
  db       : 5984
}));

describe('DB access tests', () => {
  let dbEnv;
  let carryOver;
  let statistics;
  let errorFn;

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  const dbclient = require('abacus-dbclient');

  before((done) => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';

    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-carry-over-/, done);
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach(() => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    statistics = {
      carryOver: {
        getSuccess: 0,
        getFailure: 0,
        removeSuccess: 0,
        removeFailure: 0,
        upsertSuccess: 0,
        upsertFailure: 0
      }
    };
    errorFn = spy();
  });

  afterEach(() => {
    deleteModules();
  });

  const appUsage = [{
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff0f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff0f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff0f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff0f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 1073741824
      },
      {
        measure: 'previous_running_instances',
        quantity: 2
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff1f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff1f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'current_running_instances',
        quantity: 1
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff1f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff1f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 0
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff2f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff2f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'current_running_instances',
        quantity: 1
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff0f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff0f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 0
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ]
  }];

  const usageResponse = {
    statusCode: 201,
    body: {},
    headers: {
      location: uris().collector +
      '/v1/metering/collected/usage/t/20161010/k/anonymous'
    }
  };

  context('when trying to delete already deleted document', () => {
    beforeEach((done) => {
      // Write carry-over record and then delete it
      carryOver = require('..')(statistics, errorFn);
      carryOver.write(appUsage[2], usageResponse, (error) => {
        if (error)
          done(error);
        carryOver.write(appUsage[3], usageResponse, done);
      });
    });

    it('succeeds', (done) => {
      carryOver.write(appUsage[3], usageResponse, done);
    });
  });
});
