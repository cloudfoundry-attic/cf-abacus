'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const times = _.times;
const first = _.first;
const rest = _.rest;

const moment = require('moment');

// Configure URLs
process.env.AUTH_SERVER = 'http://api';
process.env.COLLECTOR = 'http://collector';
process.env.PROVISIONING = 'http://provisioning';

describe('Read carry-over usage with paging', () => {
  let dbEnv;
  let reqMock;
  let allDocsMock;
  let renewer;
  let dbDocs;
  let dbError;
  let dbclient;

  const systemToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-carryover')];
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


  before(() => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach(() => {
    deleteModules();

    process.env.PAGE_SIZE = '10';

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

    // Mock the dbclient module
    dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    allDocsMock = spy((opt, cb) => {
      if (opt.limit) {
        cb(dbError, { rows: first(dbDocs.rows, opt.limit) });
        dbDocs = { rows : rest(dbDocs.rows, opt.limit) };
        return;
      }
      cb(dbError, dbDocs);
    });
    dbclientModule.exports = extend(() => {
      return {
        fname: 'test-mock',
        allDocs: allDocsMock
      };
    }, dbclient);
  });

  afterEach(() => {
    if (renewer)
      renewer.stopRenewer();

    deleteModules();

    // Unset the env variables
    delete process.env.PAGE_SIZE;

    reqMock = undefined;
    allDocsMock = undefined;
    renewer = undefined;
    dbclient = undefined;
    dbDocs = undefined;
    dbError = undefined;
  });

  const monthStart = moment().utc().startOf('month').valueOf();

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: guid });
  };

  const buildDbDocs = (num) => ({
    rows: times(num, (n) => ({
      doc: {
        _id: dbclient.kturi(util.format('app:%d', n), monthStart),
        collector_id: util.format('%d', n)
      }
    }))
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

  context('with usage in the database', () => {

    context.only('with usage multiple of paging size', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqMock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(appUsage, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqMock;

        dbDocs = buildDbDocs(200);

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

      it('accesses the DB with paging', () => {
        const args = allDocsMock.args;
        expect(args.length).to.equal(21);
      });
    });

    context('with usage that is not multiple of paging size', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqMock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(appUsage, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqMock;

        dbDocs = buildDbDocs(197);

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

      it('accesses the DB with paging', () => {
        const args = allDocsMock.args;
        expect(args.length).to.equal(20);
      });
    });

  });

  context('without usage', () => {
    beforeEach((done) => {
      // Mock the request module
      const request = require('abacus-request');
      reqMock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, {
            statusCode: 200,
            body: changeOrgId(appUsage, opts.usage_id)
          });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqMock;

      dbDocs = { rows: [] };

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

    it('accesses the DB only once', () => {
      const args = allDocsMock.args;
      expect(args.length).to.equal(1);
    });
  });

  context('on error accessing db', () => {
    beforeEach(() => {
      dbDocs = { rows: [] };
      dbError = 'expected db error';
    });

    it('fails', (done) => {
      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          renewer.stopRenewer();
          expect(error).to.equal(dbError);
          done();
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error(util.format('Unexpected call of success')));
        }
      });
    });
  });

});
