'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const times = _.times;

const moment = require('abacus-moment');

// Configure URLs
process.env.AUTH_SERVER = 'http://api';
process.env.COLLECTOR = 'http://collector';
process.env.PROVISIONING = 'http://provisioning';
process.env.PROVISIONING = 'http://provisioning';

describe('Read carry-over usage with paging', () => {
  const sandbox = sinon.createSandbox();

  let readAllPagesStub;
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
    delete require.cache[require.resolve('abacus-client')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  before(() => {
    process.env.SLACK = '1M';
    process.env.PAGE_SIZE = 10;
  });

  beforeEach(() => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);

    const defaultsStub = (fn) => fn;
    defaultsStub.defaults = () => ({
      delay: 20,
      maxSize: 10,
      maxCalls: 100
    });

    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = defaultsStub;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = defaultsStub;

    readAllPagesStub = sinon.stub();
    readAllPagesStub.callsFake((opts, processingFn, cb) => {
      processingFn(dbDocs, (error) => {
        expect(error).to.equal(null);
        cb(dbError);
      });
    });

    require('abacus-carryover');
    const carryOverMock = () => ({
      insert: (usage, response, guid, state, cb) => {
        cb();
      },
      readAllPages: readAllPagesStub
    });
    require.cache[require.resolve('abacus-carryover')].exports = carryOverMock;

    dbclient = require('abacus-dbclient');
  });

  afterEach(() => {
    if (renewer) renewer.stopRenewer();

    deleteModules();

    sandbox.restore();

    renewer = undefined;
    dbclient = undefined;
    dbDocs = undefined;
    dbError = undefined;
  });

  const monthStart = moment
    .utc()
    .startOf('month')
    .valueOf();

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: guid });
  };

  const buildDbDocs = (num) =>
    times(num, (n) => ({
      doc: {
        _id: dbclient.kturi(util.format('app:%d', n + 1), monthStart),
        collector_id: util.format('%d', n + 1),
        state: n % 2 === 0 ? 'STOPPED' : 'STARTED'
      }
    }));

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

  const successfulPostSpy = spy((uri, opts, cb) => {
    cb(null, {
      statusCode: 202,
      body: {},
      headers: { location: 'some location' }
    });
  });

  const successfulGetSpy = spy((uri, opts, cb) => {
    cb(undefined, {
      statusCode: 200,
      body: changeOrgId(appUsage, opts.usage_id)
    });
  });

  const mockRequestWith = (get, post) => {
    const request = require('abacus-request');
    const requestMock = extend({}, request, {
      get: get,
      post: post
    });
    require.cache[require.resolve('abacus-request')].exports = requestMock;
    return requestMock;
  };

  const mockSuccessfulRequest = () => {
    return mockRequestWith(successfulGetSpy, successfulPostSpy);
  };

  context('with usage in the database', () => {
    const testWithNumberOfDocs = (docsCount, cb) => {
      mockSuccessfulRequest();
      dbDocs = buildDbDocs(docsCount);

      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          cb(new Error(util.format('Unexpected call of failure with ' + 'error %j and response %j', error, response)));
        },
        success: () => {
          cb();
        }
      });
    };

    it('multiple of paging size', (done) => {
      testWithNumberOfDocs(200, done);
    });

    it('not multiple of paging size', (done) => {
      testWithNumberOfDocs(197, done);
    });

    it('no usage', (done) => {
      testWithNumberOfDocs(0, done);
    });
  });

  context('on error', () => {
    it('while accessing db - fails', (done) => {
      dbDocs = [];
      dbError = 'expected db error';

      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          expect(error).to.equal(dbError);
          done();
        },
        success: () => {
          done(new Error(util.format('Unexpected call of success')));
        }
      });
    });

    context('communicating with collector', () => {
      const docNumToError = 42;
      const numDocs = 197;
      const errorStatusCode = 502;

      const errorDocs = 21;
      const okDocs = 98;

      let requestMock;

      beforeEach(() => {
        successfulGetSpy.resetHistory();
        successfulPostSpy.resetHistory();

        dbDocs = buildDbDocs(numDocs);
      });

      context('while reporting usage', () => {
        beforeEach(() => {
          requestMock = mockRequestWith(
            successfulGetSpy,
            spy((uri, opts, cb) => {
              const orgId = parseInt(opts.body.organization_id);
              cb(null, {
                statusCode: orgId === docNumToError ? errorStatusCode : 202,
                body: {},
                headers: { location: 'some location' }
              });
            })
          );
        });

        it('processes all docs it can', (done) => {
          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error).not.to.equal(undefined);
              expect(response.statusCode).to.equal(errorStatusCode);
              expect(requestMock.get.callCount).to.equal(errorDocs);
              expect(requestMock.post.callCount).to.equal(errorDocs);
            },
            success: () => {
              expect(requestMock.get.callCount).to.equal(okDocs);
              expect(requestMock.post.callCount).to.equal(okDocs);
              done();
            }
          });
        });
      });

      context('while getting usage', () => {
        beforeEach(() => {
          requestMock = mockRequestWith(
            spy((uri, opts, cb) => {
              const orgId = parseInt(opts.usage_id);
              cb(null, {
                statusCode: orgId === docNumToError ? errorStatusCode : 200,
                body: changeOrgId(appUsage, opts.usage_id)
              });
            }),
            successfulPostSpy
          );
        });

        it('processes all docs it can', (done) => {
          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error).not.to.equal(undefined);
              expect(response.statusCode).to.equal(errorStatusCode);
              expect(requestMock.get.callCount).to.equal(errorDocs);
              expect(requestMock.post.callCount).to.equal(errorDocs - 1);
            },
            success: () => {
              expect(requestMock.get.callCount).to.equal(okDocs);
              expect(requestMock.post.callCount).to.equal(okDocs - 1);
              done();
            }
          });
        });
      });
    });
  });
});
