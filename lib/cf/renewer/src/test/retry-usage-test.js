'use strict';

const _ = require('underscore');
const extend = _.extend;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

const tests = (secured) => {
  let dbEnv;
  let reqmock;
  let renewer;
  let clock;

  const abacusToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
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

    if (clock)
      clock.restore();
  });

  const runningAppUsage = {
    start: Date.now(),
    end: Date.now(),
    organization_id: 1,
    space_id: 1,
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 1,
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 1024
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
  };
  const stoppedAppUsage = {
    start: Date.now(),
    end: Date.now(),
    organization_id: 1,
    space_id: 1,
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 1,
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
        quantity: 1024
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ]
  };
  const scaledAppUsage = {
    start: Date.now(),
    end: Date.now(),
    organization_id: 1,
    space_id: 1,
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 1,
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 2048
      },
      {
        measure: 'current_running_instances',
        quantity: 2
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
  };

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: guid });
  };

  const okResponse = { statusCode: 201, body: {} };

  beforeEach(() => {
    deleteModules();

    process.env.SECURED = secured ? 'true' : 'false';

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry and breaker module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;

    // Mock the request module
    const request = require('abacus-request');
    reqmock = extend({}, request, {
      post: spy((uri, opts, cb) => {
        cb(opts.body.organization_id === 3 ? 'error' : undefined, okResponse);
      })
    });
    require.cache[require.resolve('abacus-request')].exports = reqmock;

    // Mock the dbclient module
    const dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    dbclientModule.exports = extend(() => {
      return {
        fname: 'test-mock',
        allDocs: (opt, cb) => {
          cb(undefined, {
            rows: [
              { doc: scaledAppUsage },
              { doc: stoppedAppUsage },
              { doc: runningAppUsage },
              { doc: changeOrgId(stoppedAppUsage, 2) },
              { doc: changeOrgId(runningAppUsage, 3) },
              { doc: changeOrgId(scaledAppUsage, 3) }
            ]
          });
        }
      };
    }, dbclient);
  });

  afterEach(() => {
    if (renewer)
      renewer.stopRenewer();

    deleteModules();

    // Unset the SECURED variable
    delete process.env.SECURED;

    reqmock = undefined;
    renewer = undefined;
  });

  context('on error reporting usage', () => {
    beforeEach((done) => {
      renewer = require('..');
      renewer.renewUsage(abacusToken, {
        failure: (error, response) => {
          renewer.stopRenewer();

          expect(error).to.equal('error');
          expect(response).to.deep.equal(okResponse);
          done();
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });
    });

    it('retries the requests', () => {
      const args = reqmock.post.args;
      expect(args.length).to.be.above(2);
    });

    it('does not count the particular request retries', () => {
      expect(renewer.statistics.usage.reportSuccess).to.equal(1);
      expect(renewer.statistics.usage.reportConflict).to.equal(0);
      expect(renewer.statistics.usage.reportFailures).to.equal(1);
    });
  });

  context('on recurring errors', () => {
    beforeEach(() => {
      // Fake timer
      clock = sinon.useFakeTimers(Date.now());

      renewer = require('..');
    });

    afterEach(() => {
      // Restore the timer
      if (clock)
        clock.restore();
    });

    it('scheduled a new execution', (done) => {
      let failureCallCount = 0;

      renewer.renewUsage(abacusToken, {
        failure: (error, response) => {
          expect(error).to.equal('error');
          expect(response).to.deep.equal(okResponse);

          failureCallCount++;
          if (failureCallCount == 2) {
            renewer.stopRenewer();
            done();
          }
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });

      // Move clock and run the pending timers - force new execution
      clock.tick(96400000);
    });

    it('counts the global retries', (done) => {
      let failureCallCount = 0;

      renewer.renewUsage(abacusToken, {
        failure: (error, response) => {
          expect(error).to.equal('error');
          expect(response).to.deep.equal(okResponse);

          failureCallCount++;
          if (failureCallCount == 2) {
            renewer.stopRenewer();

            expect(renewer.statistics.usage.reportSuccess).to.equal(2);
            expect(renewer.statistics.usage.reportConflict).to.equal(0);
            expect(renewer.statistics.usage.reportFailures).to.equal(2);

            done();
          }
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });

      // Move clock and run the pending timers - force new execution
      clock.tick(96400000);
    });
  });
};

describe('Retry usage without security', () => tests(false));

describe('Retry usage with security', () => tests(true));
