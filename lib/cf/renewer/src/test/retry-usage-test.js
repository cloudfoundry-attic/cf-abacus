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

  const systemToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-breaker')];
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

    // Configure retry interval of 5 seconds
    process.env.RETRY_INTERVAL = 5000;
  });

  after(() => {
    process.env.DB = dbEnv;

    delete process.env.RETRY_INTERVAL;

    if (clock)
      clock.restore();
  });

  const runningAppUsage = {
    _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    start: 1466510153965,
    end: 1466510153965,
    organization_id: 'us-south:1',
    space_id: '1',
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'basic',
    resource_instance_id: '1',
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
    ],
    id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    processed_id: '0001466510156211-0-0-1-0',
    processed: 1466510156210,
    resource_type: 'linux-container',
    account_id: '1234',
    pricing_country: 'USA',
    metering_plan_id: 'basic-linux-container',
    rating_plan_id: 'linux-rating-plan',
    pricing_plan_id: 'linux-pricing-basic',
    prices: {
      metrics: [
        {
          name: 'memory',
          price: 1
        }
      ]
    },
    collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
  };

  const stoppedAppUsage = {
    _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    start: 1466510153965,
    end: 1466510153965,
    organization_id: 'us-south:1',
    space_id: '1',
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'basic',
    resource_instance_id: '1',
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
    ],
    id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    processed_id: '0001466510156211-0-0-1-0',
    processed: 1466510156210,
    resource_type: 'linux-container',
    account_id: '1234',
    pricing_country: 'USA',
    metering_plan_id: 'basic-linux-container',
    rating_plan_id: 'linux-rating-plan',
    pricing_plan_id: 'linux-pricing-basic',
    prices: {
      metrics: [
        {
          name: 'memory',
          price: 1
        }
      ]
    },
    collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
  };

  const scaledAppUsage = {
    _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    start: 1466510153965,
    end: 1466510153965,
    organization_id: 'us-south:1',
    space_id: '1',
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'basic',
    resource_instance_id: '1',
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
    ],
    id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    processed_id: '0001466510156211-0-0-1-0',
    processed: 1466510156210,
    resource_type: 'linux-container',
    account_id: '1234',
    pricing_country: 'USA',
    metering_plan_id: 'basic-linux-container',
    rating_plan_id: 'linux-rating-plan',
    pricing_plan_id: 'linux-pricing-basic',
    prices: {
      metrics: [
        {
          name: 'memory',
          price: 1
        }
      ]
    },
    collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
  };

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: 'us-south:' + guid });
  };

  const linuxContainerPlan = {
    plan_id: 'basic-linux-container',
    metrics: [
      {
        name: 'memory',
        unit: 'GIGABYTE',
        type: 'time-based'
      }
    ]
  };

  const okResponse = { statusCode: 201, body: {} };

  beforeEach(() => {
    deleteModules();

    process.env.SECURED = secured ? 'true' : 'false';

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch and breaker module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;

    // Mock the request module
    const request = require('abacus-request');
    reqmock = extend({}, request, {
      get: spy((uri, opts, cb) => {
        cb(undefined, { statusCode: 200, body: linuxContainerPlan });
      }),
      post: spy((uri, opts, cb) => {
        cb(opts.body.organization_id === 'us-south:3' ?
          'error' : undefined, okResponse);
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
      renewer.renewUsage(systemToken, {
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
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          expect(error).to.equal('error');
          expect(response).to.deep.equal(okResponse);

          if (renewer.statistics.retries.count == 2) {
            renewer.stopRenewer();
            done();
          }
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });

      // Move clock and run the pending timers to force new execution
      clock.tick(2 * 6000);
    });

    it('counts the global retries', (done) => {
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          expect(error).to.equal('error');
          expect(response).to.deep.equal(okResponse);

          if (renewer.statistics.retries.count == 2) {
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

      // Move clock and run the pending timers to force new execution
      clock.tick(2 * 6000);
    });
  });
};

describe('Retry usage reporting without security', () => tests(false));

describe('Retry usage reporting with security', () => tests(true));
