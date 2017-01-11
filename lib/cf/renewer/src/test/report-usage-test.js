'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const map = _.map;

const moment = require('moment');

// Configure URLs
process.env.AUTH_SERVER = 'http://api';
process.env.COLLECTOR = 'http://collector';
process.env.PROVISIONING = 'http://provisioning';

const tests = (secured) => {
  let dbEnv;
  let reqmock;
  let allDocsMock;
  let renewer;
  let dbDocs;

  const systemToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-carryover')];
    delete require.cache[require.resolve('abacus-dbclient')];
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

    // Mock the dbclient module
    allDocsMock = spy((opt, cb) => {
      cb(undefined, dbDocs);
    });
    const dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
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

    // Unset the SECURED variable
    delete process.env.SECURED;

    reqmock = undefined;
    allDocsMock = undefined;
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

  const generateUsage = (usage, millisToAdd, usageType) => {
    const refreshedUsage = renewer.refreshUsage(usage, millisToAdd);
    const modifiedUsage = renewer.zeroUsage(refreshedUsage, usageType);
    return renewer.sanitizeUsageDoc(modifiedUsage);
  };

  const checkPostRequest = (req, usage) => {
    expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
    expect(req[1]).to.contain.all.keys('collector', 'body');
    expect(req[1].collector).to.equal(process.env.COLLECTOR);

    expect(req[1].body).to.deep.equal(usage);
  };

  const checkGetRequest = (request, collectorId) => {
    expect(request[0]).to.equal(
      ':collector/v1/metering/collected/usage/:usage_id'
    );
    expect(request[1]).to.contain.all.keys(
      'collector', 'usage_id', 'headers'
    );
    expect(request[1].collector).to.equal(process.env.COLLECTOR);
    expect(request[1].usage_id).to.equal(collectorId);
  };

  const buildDbDocs = (docs) => (
    {
      rows: map(docs, (doc) => ({
        doc: extend({}, doc)
      }))
    }
  );

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: guid });
  };

  const getResponse = (code, body) => ({ statusCode: code, body: body });

  context('with usage in db', () => {

    context('with multiple apps', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1' },
          { _id: 'app2', collector_id: '2' }
        ]);

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

      it('gets the real usage from the COLLECTOR', () => {
        const args = reqmock.get.args;
        expect(args.length).to.equal(2);
        checkGetRequest(args[0], '1');
        checkGetRequest(args[1], '2');
      });

      it('reports refreshed usage to COLLECTOR', () => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(4);
        checkPostRequest(args[0], generateUsage(appUsage, 0, 'current'));
        checkPostRequest(args[1], generateUsage(appUsage, 1, 'previous'));
        checkPostRequest(args[2], generateUsage(appUsage, 0, 'current'));
        checkPostRequest(args[3], generateUsage(appUsage, 1, 'previous'));
      });

      it('counts the reported usage', () => {
        expect(renewer.statistics.usage.getSuccess).to.equal(2);
        expect(renewer.statistics.usage.getFailures).to.equal(0);
        expect(renewer.statistics.usage.reportSuccess).to.equal(4);
        expect(renewer.statistics.usage.reportConflict).to.equal(0);
        expect(renewer.statistics.usage.reportFailures).to.equal(0);
      });

      it('raises correct reporting errors', () => {
        expect(renewer.errors.noReportEverHappened).to.equal(false);
        expect(renewer.errors.noGetEverHappened).to.equal(false);

        expect(renewer.errors.consecutiveGetFailures).to.equal(0);
        expect(renewer.errors.consecutiveReportFailures).to.equal(0);
      });
    });

    context('on error getting usage', () => {
      let collectorIdToError;
      let renewer;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(opts.usage_id === collectorIdToError ? 'error' : undefined,
              getResponse(200, appUsage));
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined, getResponse(201, {}));
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1' },
          { _id: 'app2', collector_id: '2' }
        ]);
      });

      context('on the first org usage', () => {
        const startTime = Date.now();

        beforeEach((done) => {
          collectorIdToError = '1';

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(getResponse(200, appUsage));
              expect(response).to.deep.equal(getResponse(200, appUsage));
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);
          checkGetRequest(args[0], '1');
        });

        it('does not report usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(0);
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(0);
          expect(renewer.statistics.usage.getFailures).to.equal(1);
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(true);
          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.noReportEverHappened).to.equal(true);

          expect(renewer.errors.consecutiveGetFailures).to.equal(1);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });

      });

      context('on the last org usage', () => {
        const startTime = Date.now();

        beforeEach((done) => {
          collectorIdToError = '2';

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(getResponse(200, appUsage));
              expect(response).to.deep.equal(getResponse(200, appUsage));
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
          checkGetRequest(args[1], '2');
        });

        it('reports usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0], generateUsage(appUsage, 0, 'current'));
          checkPostRequest(args[1], generateUsage(appUsage, 1, 'previous'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(1);
          expect(renewer.statistics.usage.getFailures).to.equal(1);
          expect(renewer.statistics.usage.reportSuccess).to.equal(2);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(1);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('with failed gets', () => {
        beforeEach((done) => {
          collectorIdToError = '1';

          renewer.renewUsage(systemToken, {
            failure: () => {
              renewer.stopRenewer();
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        context('on successful report', () => {
          beforeEach((done) => {
            collectorIdToError = 'non-existing';

            renewer.renewUsage(systemToken, {
              failure: (error, response) => {
                renewer.stopRenewer();
                done(new Error(util.format('Unexpected call of failure with' +
                  ' error %j and response %j', error, response)));
                done();
              },
              success: () => {
                renewer.stopRenewer();
                done();
              }
            });
          });

          it('clears reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);
            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(0);
          });
        });
      });
    });

    context('on bad response getting usage', () => {
      let errorResponseCode;
      let collectorIdToError;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined,
              opts.usage_id === collectorIdToError ?
                getResponse(errorResponseCode, {}) :
                getResponse(200, appUsage));
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 201,
              body: changeOrgId(appUsage, opts.usage_id)
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1' },
          { _id: 'app2', collector_id: '2' }
        ]);
      });

      context('on the first org usage', () => {
        const startTime = Date.now();

        beforeEach((done) => {
          collectorIdToError = '1';
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal(undefined);
              expect(error.response).to.deep.equal(
                getResponse(errorResponseCode, {})
              );
              expect(response).to.deep.equal(
                getResponse(errorResponseCode, {})
              );
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);
          checkGetRequest(args[0], '1');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(0);
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(0);
          expect(renewer.statistics.usage.getFailures).to.equal(1);
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(true);
          expect(renewer.errors.noGetEverHappened).to.equal(true);

          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(1);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('on the last org usage', () => {
        const startTime = Date.now();

        beforeEach((done) => {
          collectorIdToError = '2';
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal(undefined);
              expect(error.response).to.deep.equal(
                getResponse(errorResponseCode, {})
              );
              expect(response).to.deep.equal(
                getResponse(errorResponseCode, {})
              );
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
          checkGetRequest(args[1], '2');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0], generateUsage(appUsage, 0, 'current'));
          checkPostRequest(args[1], generateUsage(appUsage, 1, 'previous'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(1);
          expect(renewer.statistics.usage.getFailures).to.equal(1);
          expect(renewer.statistics.usage.reportSuccess).to.equal(2);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(1);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('with failed gets', () => {
        beforeEach((done) => {
          collectorIdToError = '1';

          renewer.renewUsage(systemToken, {
            failure: () => {
              renewer.stopRenewer();
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        context('on successful report', () => {
          beforeEach((done) => {
            collectorIdToError = 'non-existing';

            renewer.renewUsage(systemToken, {
              failure: (error, response) => {
                renewer.stopRenewer();
                done(new Error(util.format('Unexpected call of failure with' +
                  ' error %j and response %j', error, response)));
                done();
              },
              success: () => {
                renewer.stopRenewer();
                done();
              }
            });
          });

          it('clears reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);
            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(0);
          });
        });
      });
    });

    context('on error during reporting', () => {
      const mockedResponse = { statusCode: 201, body: {} };

      let numPostRequestToError;
      let renewer;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        let numPostRequests = 0;
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(appUsage, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(++numPostRequests === numPostRequestToError ?
              'error' : undefined, mockedResponse);
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1' },
          { _id: 'app2', collector_id: '2' }
        ]);
      });

      afterEach(() => {
        numPostRequestToError = undefined;
      });

      context('on the first org usage', () => {
        const startTime = Date.now();
        beforeEach((done) => {
          numPostRequestToError = 1;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('stop report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(mockedResponse);
              expect(response).to.deep.equal(mockedResponse);
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);
          checkGetRequest(args[0], '1');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '1'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(1);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(true);

          expect(renewer.errors.lastError).to.match(/^Failed reporting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('on the last org usage', () => {
        const startTime = Date.now();

        beforeEach((done) => {
          numPostRequestToError = 3;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('stop report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(mockedResponse);
              expect(response).to.deep.equal(mockedResponse);
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
          checkGetRequest(args[1], '2');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(3);

          checkPostRequest(args[0],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '1'));
          checkPostRequest(args[1],
            changeOrgId(generateUsage(appUsage, 1, 'previous'), '1'));
          checkPostRequest(args[2],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '2'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(2);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(2);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed reporting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('on the second usage post (start)', () => {
        const startTime = Date.now();

        beforeEach((done) => {
          numPostRequestToError = 2;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('start report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(mockedResponse);
              expect(response).to.deep.equal(mockedResponse);
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);
          checkGetRequest(args[0], '1');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);

          checkPostRequest(args[0],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '1'));
          checkPostRequest(args[1],
            changeOrgId(generateUsage(appUsage, 1, 'previous'), '1'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(1);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(1);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed reporting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('with failed reporting', () => {
        beforeEach((done) => {
          numPostRequestToError = 1;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: () => {
              renewer.stopRenewer();
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        context('on successful report', () => {
          beforeEach((done) => {
            // do not fail anymore
            numPostRequestToError = undefined;

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
          });

          it('clears reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);
            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(0);
          });
        });
      });
    });

    context('on bad response during reporting', () => {
      const getResponse = (code) => ({ statusCode: code });
      const startTime = Date.now();

      let errorResponseCode;
      let numPostRequestToError;
      let renewer;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        let numPostRequests = 0;
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(appUsage, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined,
              ++numPostRequests === numPostRequestToError ?
              getResponse(errorResponseCode) : getResponse(201));
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1' },
          { _id: 'app2', collector_id: '2' }
        ]);
      });

      afterEach(() => {
        numPostRequestToError = undefined;
        errorResponseCode = undefined;
      });

      context('on the first org usage', () => {
        beforeEach((done) => {
          numPostRequestToError = 1;
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('stop report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal(undefined);
              expect(error.response).to.deep.equal(
                getResponse(errorResponseCode)
              );
              expect(response).to.deep.equal(
                getResponse(errorResponseCode)
              );
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);
          checkGetRequest(args[0], '1');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '1'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(1);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(true);

          expect(renewer.errors.lastError).to.match(/^Failed reporting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('on the last org usage', () => {
        const startTime = Date.now();
        beforeEach((done) => {
          numPostRequestToError = 3;
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('stop report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal(undefined);
              expect(error.response).to.deep.equal(
                getResponse(errorResponseCode)
              );
              expect(response).to.deep.equal(
                getResponse(errorResponseCode)
              );
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
          checkGetRequest(args[1], '2');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(3);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '1'));
          checkPostRequest(args[1],
            changeOrgId(generateUsage(appUsage, 1, 'previous'), '1'));
          checkPostRequest(args[2],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '2'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(2);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(2);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed reporting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('when 409 is returned', () => {
        beforeEach((done) => {
          numPostRequestToError = 3;
          errorResponseCode = 409;

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

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
          checkGetRequest(args[1], '2');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(4);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '1'));
          checkPostRequest(args[1],
            changeOrgId(generateUsage(appUsage, 1, 'previous'), '1'));
          checkPostRequest(args[2],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '2'));
          checkPostRequest(args[3],
            changeOrgId(generateUsage(appUsage, 1, 'previous'), '2'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(2);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(3);
          expect(renewer.statistics.usage.reportConflict).to.equal(1);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(false);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('on the second usage post (start)', () => {
        beforeEach((done) => {
          numPostRequestToError = 2;
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error.op).to.equal('start report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal(undefined);
              expect(error.response).to.deep.equal(
                getResponse(errorResponseCode)
              );
              expect(response).to.deep.equal(
                getResponse(errorResponseCode)
              );
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);
          checkGetRequest(args[0], '1');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(appUsage, 0, 'current'), '1'));
          checkPostRequest(args[1],
            changeOrgId(generateUsage(appUsage, 1, 'previous'), '1'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.getSuccess).to.equal(1);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(1);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed reporting usage/);
          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
            .getTime();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('with failed reporting', () => {
        beforeEach((done) => {
          numPostRequestToError = 1;
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: () => {
              renewer.stopRenewer();
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        context('on successful report', () => {
          beforeEach((done) => {
            numPostRequestToError = undefined;
            errorResponseCode = 201;

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
          });

          it('clears reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);
            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(0);
          });
        });
      });
    });

    context('with slack window set', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200, body: appUsage });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1' },
          { _id: 'app2', collector_id: '2' }
        ]);

        process.env.SLACK = '1D';

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

      it('uses it to query the carry-over DB', () => {
        const args = allDocsMock.args;
        expect(args.length).to.equal(1);
        expect(args[0][0]).to.contain.all.keys('startkey');
        const expectedTimeStamp = moment().utc().subtract(1, 'months')
          .startOf('month').subtract(1, 'days').valueOf();
        expect(args[0][0].startkey).to.contain(expectedTimeStamp);
      });
    });
  });

  context('without usage in db', () => {
    beforeEach((done) => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, { statusCode: 200, body: appUsage });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

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

    it('gets no usage from the COLLECTOR', () => {
      const args = reqmock.get.args;
      expect(args.length).to.equal(0);
    });

    it('reports no usage to COLLECTOR', () => {
      const args = reqmock.post.args;
      expect(args.length).to.equal(0);
    });

    it('counts the reported usage', () => {
      expect(renewer.statistics.usage.getSuccess).to.equal(0);
      expect(renewer.statistics.usage.getFailures).to.equal(0);
      expect(renewer.statistics.usage.reportSuccess).to.equal(0);
      expect(renewer.statistics.usage.reportConflict).to.equal(0);
      expect(renewer.statistics.usage.reportFailures).to.equal(0);
    });

    it('raises correct reporting errors', () => {
      expect(renewer.errors.noReportEverHappened).to.equal(true);
      expect(renewer.errors.noGetEverHappened).to.equal(true);

      expect(renewer.errors.consecutiveGetFailures).to.equal(0);
      expect(renewer.errors.consecutiveReportFailures).to.equal(0);
    });
  });

  context('with missing CF oAuth Token', () => {
    let startTime;

    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, { statusCode: 200, body: appUsage });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      dbDocs = buildDbDocs([
        { _id: 'app1', collector_id: '1' },
        { _id: 'app2', collector_id: '2' }
      ]);

      renewer = require('..');

      startTime = Date.now();
    });

    // Runs only tests requiring security
    const runWithSecurity = secured ? it : it.skip;
    // Runs tests without security
    const runWithoutSecurity = secured ? it.skip : it;

    runWithSecurity('calls back with error', (done) => {
      renewer.renewUsage(() => undefined, {
        failure: (error, response) => {
          renewer.stopRenewer();

          expect(error).to.equal('Missing token');
          expect(response).to.equal(undefined);
          done();
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });
    });

    runWithSecurity('raises missing token error', (done) => {
      renewer.renewUsage(() => undefined, {
        failure: () => {
          renewer.stopRenewer();
          expect(renewer.errors.missingToken).to.equal(true);
          expect(renewer.errors.lastError).to.equal('Missing token');

          const errorTime = new Date(renewer.errors.lastErrorTimestamp)
             .getTime();
          expect(errorTime).to.be.at.least(startTime);
          done();
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });
    });

    runWithSecurity('raises correct error flags', (done) => {
      renewer.renewUsage(() => undefined, {
        failure: () => {
          renewer.stopRenewer();
          expect(renewer.errors.noReportEverHappened).to.equal(true);
          expect(renewer.errors.noGetEverHappened).to.equal(true);
          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
          done();
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });
    });

    runWithSecurity('counts the attempts with missing token', (done) => {
      renewer.renewUsage(() => undefined, {
        failure: () => {
          renewer.stopRenewer();
          expect(renewer.statistics.usage.missingToken).to.equal(1);
          expect(renewer.statistics.usage.getSuccess).to.equal(0);
          expect(renewer.statistics.usage.getFailures).to.equal(0);
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
          done();
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error('Unexpected call of success'));
        }
      });
    });

    runWithoutSecurity('does not require token', (done) => {
      renewer.renewUsage(() => undefined, {
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
    });

    runWithoutSecurity('has no attempts with missing token', (done) => {
      renewer.renewUsage(() => undefined, {
        failure: (error, response) => {
          renewer.stopRenewer();
          done(new Error(util.format('Unexpected call of failure with' +
            ' error %j and response %j', error, response)));
        },
        success: () => {
          renewer.stopRenewer();

          expect(renewer.statistics.usage.missingToken).to.equal(0);
          done();
        }
      });
    });
  });
};

describe('Report usage without security', () => tests(false));

describe('Report usage with security', () => tests(true));
