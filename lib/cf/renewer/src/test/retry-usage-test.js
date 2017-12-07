'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;

const moment = require('abacus-moment');

// Configure API and COLLECTOR URLs
process.env.AUTH_SERVER = 'http://api';
process.env.COLLECTOR = 'http://collector';

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

process.env.RETRY_INTERVAL = 5000;

// Speed-up the tests execution. Retries are done with exponential back-off
process.env.RETRIES = 2;

const systemToken = () => 'token';

const sandbox = sinon.sandbox.create();

const tests = (secured) => {
  let reqmock;
  let dbDocs;
  let renewer;
  let clock;

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-carryover')];
    delete require.cache[require.resolve('abacus-client')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-client')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];
  };

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

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: 'us-south:' + guid });
  };

  const okPostResponse = {
    statusCode: 201,
    headers: { location: 'some location' },
    body: {}
  };

  beforeEach(() => {
    deleteModules();

    process.env.SLACK = '1M';
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
        cb(undefined, {
          statusCode: 200,
          body: changeOrgId(appUsage, opts.usage_id)
        });
      }),
      post: spy((uri, opts, cb) => {
        cb(opts.body.organization_id === 'us-south:2' ?
          'error' : undefined, okPostResponse);
      })
    });
    require.cache[require.resolve('abacus-request')].exports = reqmock;

    dbDocs = [
      { doc: { _id: 'app1', collector_id: '1', state: 'STARTED' } },
      { doc: { _id: 'app2', collector_id: '2', state: 'STARTED' } },
      { doc: { _id: 'app2', collector_id: '3', state: 'STARTED' } }
    ];

    const readAllPagesStub = sinon.stub();
    readAllPagesStub.callsFake((opts, processingFn, cb) => {
      processingFn(dbDocs, (error) => {
        expect(error).to.equal(null);
        cb();
      });
    });

    require('abacus-carryover');
    const carryOverMock = () => ({
      write: (usage, response, guid, state, cb) => {
        cb();
      },
      readAllPages: readAllPagesStub
    });
    require.cache[require.resolve('abacus-carryover')].exports = carryOverMock;
  });

  afterEach(() => {
    if (renewer)
      renewer.stopRenewer();

    deleteModules();

    sandbox.restore();

    // Unset variables used for testing
    delete process.env.SECURED;
    delete process.env.PAGE_SIZE;
    delete process.env.SLACK;

    reqmock = undefined;
    dbDocs = undefined;
    renewer = undefined;
  });

  context('on error reporting usage', () => {
    beforeEach((done) => {
      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          expect(error.op).to.equal('start report');
          expect(error.doc).to.not.equal(undefined);
          expect(error.error).to.equal('error');
          expect(error.response).to.deep.equal(okPostResponse);
          expect(response).to.deep.equal(okPostResponse);
        },
        success: () => {
          done();
        }
      });
    });

    it('retries the requests', () => {
      const args = reqmock.post.args;
      expect(args.length).to.be.above(2);
    });

    it('does not count the particular request retries', () => {
      expect(renewer.statistics.usage.report).to.deep.equal({
        success: 2,
        conflicts: 0,
        failures: 1
      });

      expect(renewer.statistics.usage.get).to.deep.equal({
        success: 3,
        failures: 0,
        missingToken: 0
      });
    });
  });

  context('on error reporting usage with paging', () => {
    beforeEach((done) => {
      process.env.PAGE_SIZE = 2;

      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          renewer.stopRenewer();

          expect(error.op).to.equal('start report');
          expect(error.doc).to.not.equal(undefined);
          expect(error.error).to.equal('error');
          expect(error.response).to.deep.equal(okPostResponse);
          expect(response).to.deep.equal(okPostResponse);
        },
        success: () => {
          done();
        }
      });
    });

    it('retries the requests', () => {
      const args = reqmock.post.args;
      expect(args.length).to.be.above(2);
    });

    it('does not do out of page requests', () => {
      expect(renewer.statistics.usage.report).to.deep.equal({
        success: 2,
        conflicts: 0,
        failures: 1
      });

      expect(renewer.statistics.usage.get).to.deep.equal({
        success: 3,
        failures: 0,
        missingToken: 0
      });
    });
  });

  context('on recurring errors', () => {
    beforeEach(() => {
      // Fake timer
      clock = sinon.useFakeTimers(moment.utc().valueOf());

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
          expect(error.op).to.contain('report');
          expect(error.doc).to.not.equal(undefined);
          expect(error.error).to.equal('error');
          expect(error.response).to.deep.equal(okPostResponse);
          expect(response).to.deep.equal(okPostResponse);
        },
        success: () => {
          renewer.stopRenewer();
          done();
        }
      });

      // Move clock and run the pending timers to force new execution
      clock.tick(2 * (process.env.RETRY_INTERVAL + 1000));
    });

    it('counts the global retries', (done) => {
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          expect(error.op).to.contain('report');
          expect(error.doc).to.not.equal(undefined);
          expect(error.error).to.equal('error');
          expect(error.response).to.deep.equal(okPostResponse);
          expect(response).to.deep.equal(okPostResponse);

          if (renewer.statistics.retries.count === 2) {
            renewer.stopRenewer();

            expect(renewer.statistics.usage.report).to.deep.equal({
              success: 4,
              conflicts: 0,
              failures: 2
            });

            expect(renewer.statistics.usage.get).to.deep.equal({
              success: 6,
              failures: 0,
              missingToken: 0
            });
          }
        },
        success: () => {
          done();
        }
      });

      // Move clock and run the pending timers to force new execution
      clock.tick(2 * (process.env.RETRY_INTERVAL + 1000));
    });
  });

  context('when out of slack', () => {
    beforeEach(() => {
      // Fake timer
      clock = sinon.useFakeTimers(moment.utc().valueOf());

      // Set the slack to 2 minutes
      process.env.SLACK = '2m';

      renewer = require('..');
    });

    afterEach(() => {
      // Restore the timer
      if (clock)
        clock.restore();
    });

    it('does not schedule a new execution', (done) => {
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          renewer.stopRenewer();
          done(new Error(util.format('Unexpected call of failure with' +
            ' error %j and response %j', error, response)));
        },
        success: () => {
          renewer.stopRenewer();
          done();
        }
      });

      // Move clock after the slack
      clock.tick(3 * 60 * 1000);
    });
  });
};

describe('Retry usage reporting without security', () => tests(false));

describe('Retry usage reporting with security', () => tests(true));
