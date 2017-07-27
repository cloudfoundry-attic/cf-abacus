'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const map = _.map;

// Configure URLs
process.env.AUTH_SERVER = 'http://api';
process.env.COLLECTOR = 'http://collector';
process.env.PROVISIONING = 'http://provisioning';

const tests = (secured) => {
  let dbEnv;
  let writeSpy;
  let reqmock;
  let renewer;
  let dbDocs;

  const systemToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-carryover')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-client')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  before(() => {
    dbEnv = process.env.DB;

    // Set slack to month
    process.env.SLACK = '1M';

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;

    delete process.env.SLACK;
  });

  beforeEach(() => {
    deleteModules();

    process.env.SECURED = secured ? 'true' : 'false';

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

    // Mock the carryover module
    require('abacus-carryover');
    const carryOverMock = () => ({
      write: writeSpy,
      readPage: (startId, endId, pageSize, skip, cb) => {
        cb(undefined, dbDocs.slice(skip, skip + pageSize));
      }
    });
    require.cache[require.resolve('abacus-carryover')].exports
      = carryOverMock;
  });

  afterEach(() => {
    if (renewer)
      renewer.stopRenewer();

    deleteModules();

    // Unset the SECURED variable
    delete process.env.SECURED;
  });

  const appUsage = {
    start: 1476878391000,
    end: 1476878391000,
    organization_id: '1',
    space_id: '2',
    resource_id: 'linux-container',
    plan_id: 'basic',
    consumer_id: 'app:1fb61c1f-2db3-4235-9934-00097845b80d',
    resource_instance_id: '1fb61c1f-2db3-4235-9934-00097845b80d',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 512
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
    ],
    processed_id: '0001476878403858-0-0-1-0',
    processed: 1476878403858,
    id: 't/0001476878403858-0-0-1-0/k/anonymous'
  };

  const buildDbDocs = (docs) => map(docs, (doc) => ({
    doc: extend({}, doc)
  }));

  const generateUsage = (usage, millisToAdd, usageType) => {
    const refreshedUsage = renewer.refreshUsage(usage, millisToAdd);
    const modifiedUsage = renewer.zeroUsage(refreshedUsage, usageType);
    return renewer.sanitizeUsageDoc(modifiedUsage);
  };

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: guid });
  };

  context('on success', () => {

    beforeEach((done) => {
      dbDocs = buildDbDocs([
        { _id: 'app1',
          collector_id: '1',
          state: 'STARTED',
          timestamp: 'time1'
        },
        { _id: 'app2',
          collector_id: '2',
          state: 'STARTED',
          timestamp: 'time2'
        }
      ]);

      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, { statusCode: 200, body: appUsage });
        }),
        post: spy((uri, opts, cb) => {
          cb(undefined, {
            statusCode: 201,
            headers: { location: 'some location' },
            body: {}
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      writeSpy = spy((usage, response, guid, state, cb) => {
        cb(undefined);
      });

      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          renewer.stopRenewer();
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %j and response %j', error, response)));
        },
        success: () => {
          renewer.stopRenewer();
          done();
        }
      });
    });

    it('inserts in carry-over db', () => {
      expect(writeSpy.callCount).to.equal(2);
      assert.alwaysCalledWith(writeSpy,
        generateUsage(appUsage, 0, 'previous'));
    });
  });

  context('on failure storing carry-over', () => {

    const testError = new Error();

    beforeEach((done) => {
      dbDocs = buildDbDocs([
        {
          _id: 'app1',
          collector_id: '1',
          state: 'STARTED',
          timestamp: 'time1'
        },
        {
          _id: 'app2',
          collector_id: '2',
          state: 'STARTED',
          timestamp: 'time2'
        }
      ]);

      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, {
            statusCode: 200,
            body: changeOrgId(appUsage, opts.usage_id)
          });
        }),
        post: spy((uri, opts, cb) => {
          cb(undefined, {
            statusCode: 201,
            headers: { location: 'some location' },
            body: {}
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      writeSpy = spy((usage, response, guid, state, cb) => {
        cb(usage.organization_id === '1' ? testError : undefined);
      });

      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          expect(error).to.equal(testError);
          expect(response.statusCode).to.equal(201);
        },
        success: () => {
          renewer.stopRenewer();
          done();
        }
      });
    });

    it('does not store in carry-over db', () => {
      expect(writeSpy.callCount).to.equal(2);
      assert.calledWith(writeSpy,
        changeOrgId(generateUsage(appUsage, 0, 'previous'), '1'));
      assert.calledWith(writeSpy,
        changeOrgId(generateUsage(appUsage, 0, 'previous'), '2'));
    });
  });

};

describe('Carry-over usage from last month without security',
  () => tests(false));

describe('Carry-over usage from last month with security',
  () => tests(true));
