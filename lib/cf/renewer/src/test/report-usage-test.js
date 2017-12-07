'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const map = _.map;

const moment = require('abacus-moment');

process.env.AUTH_SERVER = 'http://api';
process.env.COLLECTOR = 'http://collector';
process.env.PROVISIONING = 'http://provisioning';

const tests = (usageType, secured) => {
  const sandbox = sinon.sandbox.create();

  let dbEnv;
  let reqmock;
  let readAllPagesStub;
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
    process.env.SLACK = '1M';

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;
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

    readAllPagesStub = sinon.stub();
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

    // Unset the SECURED variable
    delete process.env.SECURED;

    reqmock = undefined;
    readAllPagesStub = undefined;
  });

  const renewIgnoringFailure = (done) => {
    renewer.renewUsage(systemToken, {
      failure: () => {},
      success: () => done()
    });
  };

  const renewUsage = (done) => {
    renewer.renewUsage(systemToken, {
      failure: (error, response) => {
        done(new Error(util.format('Unexpected call of failure with ' +
          'error %j and response %j', error, response)));
      },
      success: () => {
        done();
      }
    });
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

  const buildDbDocs = (docs) => map(docs, (doc) => ({
    doc: extend({}, doc)
  }));

  const changeOrgId = (usage, guid) => extend({}, usage, {
    organization_id: guid
  });

  const buildResponse = (code, headers, body = {}) => ({
    statusCode: code,
    headers: headers,
    body: body
  });

  context('with usage in db', () => {

    context('with multiple events', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200, body: usageType.events });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              headers: { location: 'some location' },
              body: {}
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1', state: usageType.state },
          { _id: 'app2', collector_id: '2', state: usageType.state }
        ]);

        renewer = require('..');
        renewUsage(done);
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
        checkPostRequest(args[0],
          generateUsage(usageType.events, 0, 'previous'));
        checkPostRequest(args[1],
          generateUsage(usageType.events, 0, 'previous'));
      });

      it('counts the reported usage', () => {
        expect(renewer.statistics.usage.get.success).to.equal(2);
        expect(renewer.statistics.usage.get.failures).to.equal(0);
        expect(renewer.statistics.usage.report.success).to.equal(2);
        expect(renewer.statistics.usage.report.conflicts).to.equal(0);
        expect(renewer.statistics.usage.report.failures).to.equal(0);
      });

      it('raises correct reporting errors', () => {
        expect(renewer.errors.noReportEverHappened).to.equal(false);
        expect(renewer.errors.noGetEverHappened).to.equal(false);

        expect(renewer.errors.consecutiveGetFailures).to.equal(0);
        expect(renewer.errors.consecutiveReportFailures).to.equal(0);
      });
    });

    context(`on error getting ${usageType.name} usage`, () => {
      let collectorIdToError;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(opts.usage_id === collectorIdToError ? 'error' : undefined,
              buildResponse(200, {}, usageType.events));
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined, buildResponse(201, { location: 'some location' }));
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1', state: usageType.state },
          { _id: 'app2', collector_id: '2', state: usageType.state }
        ]);
      });

      context('on the first org usage', () => {
        const startTime = moment.now();

        beforeEach((done) => {
          collectorIdToError = '1';

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(
                buildResponse(200, {}, usageType.events)
              );
              expect(response).to.deep.equal(
                buildResponse(200, {}, usageType.events)
              );
            },
            success: () => {
              done();
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
        });

        it('does not report usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(1);
          expect(renewer.statistics.usage.get.failures).to.equal(1);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);

          const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
            .valueOf();

          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.noReportEverHappened).to.equal(false);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });

      });

      context('on the last org usage', () => {
        const startTime = moment.now();

        beforeEach((done) => {
          collectorIdToError = '2';

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(
                buildResponse(200, {}, usageType.events)
              );
              expect(response).to.deep.equal(
                buildResponse(200, {}, usageType.events)
              );
            },
            success: () => {
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

        it('reports usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
          checkPostRequest(args[0],
            generateUsage(usageType.events, 0, 'previous'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(1);
          expect(renewer.statistics.usage.get.failures).to.equal(1);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);
          const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(1);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('with failed gets', () => {
        beforeEach((done) => {
          collectorIdToError = '1';
          renewIgnoringFailure(done);
        });

        context('on successful report', () => {
          beforeEach((done) => {
            collectorIdToError = 'non-existing';
            renewUsage(done);
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
                buildResponse(errorResponseCode, {}) :
                buildResponse(200, {}, usageType.events));
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined, buildResponse(201, { location: 'some location' },
              changeOrgId(usageType.events, opts.usage_id)));
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1', state: usageType.state },
          { _id: 'app2', collector_id: '2', state: usageType.state }
        ]);
      });

      context('on the first org usage', () => {
        const startTime = moment.now();

        beforeEach((done) => {
          collectorIdToError = '1';
          errorResponseCode = 500;

          renewer = require('..');

          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal(undefined);
              expect(error.response).to.deep.equal(
                buildResponse(errorResponseCode, {})
              );
              expect(response).to.deep.equal(
                buildResponse(errorResponseCode, {})
              );
            },
            success: () => {
              done();
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(reqmock.get.calledTwice).to.equal(true);
          checkGetRequest(args[0], '1');
          checkGetRequest(args[1], '2');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(1);
          expect(renewer.statistics.usage.get.failures).to.equal(1);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);
          const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('on the last org usage', () => {
        const startTime = moment.now();

        beforeEach((done) => {
          collectorIdToError = '2';
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error.op).to.equal('get');
              expect(error.doc).to.deep.equal({
                collector_id: collectorIdToError
              });
              expect(error.error).to.equal(undefined);
              expect(error.response).to.deep.equal(
                buildResponse(errorResponseCode, {})
              );
              expect(response).to.deep.equal(
                buildResponse(errorResponseCode, {})
              );
            },
            success: () => {
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
          expect(args.length).to.equal(1);
          checkPostRequest(args[0],
            generateUsage(usageType.events, 0, 'previous'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(1);
          expect(renewer.statistics.usage.get.failures).to.equal(1);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(0);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).to.match(/^Failed getting usage/);
          const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(1);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('with failed gets', () => {
        beforeEach((done) => {
          collectorIdToError = '1';
          renewIgnoringFailure(done);
        });

        context('on successful report', () => {
          beforeEach((done) => {
            collectorIdToError = 'non-existing';
            renewUsage(done);
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
      const mockedResponse = buildResponse(201,
        { location: 'some location' });

      let numPostRequestToError;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        let numPostRequests = 0;
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(usageType.events, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(++numPostRequests === numPostRequestToError ?
              'error' : undefined, mockedResponse);
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1', state: usageType.state },
          { _id: 'app2', collector_id: '2', state: usageType.state }
        ]);
      });

      afterEach(() => {
        numPostRequestToError = undefined;
      });

      context('on the first org usage', () => {
        const startTime = moment.now();
        beforeEach((done) => {
          numPostRequestToError = 1;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error.op).to.equal('start report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(mockedResponse);
              expect(response).to.deep.equal(mockedResponse);

            },
            success: () => {
              done();
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(usageType.events, 0, 'previous'), '1'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(2);
          expect(renewer.statistics.usage.get.failures).to.equal(0);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(false);

          expect(renewer.errors.lastError).
            to.match(/^Failed reporting usage/);
          const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('on the last org usage', () => {
        const startTime = moment.now();

        beforeEach((done) => {
          numPostRequestToError = 2;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error.op).to.equal('start report');
              expect(error.doc).to.not.equal(undefined);
              expect(error.error).to.equal('error');
              expect(error.response).to.deep.equal(mockedResponse);
              expect(response).to.deep.equal(mockedResponse);
            },
            success: () => {
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
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(usageType.events, 0, 'previous'), '1'));
          checkPostRequest(args[1],
            changeOrgId(generateUsage(usageType.events, 0, 'previous'), '2'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(2);
          expect(renewer.statistics.usage.get.failures).to.equal(0);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noReportEverHappened).to.equal(false);
          expect(renewer.errors.noGetEverHappened).to.equal(false);

          expect(renewer.errors.lastError).
            to.match(/^Failed reporting usage/);
          const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('with failed reporting', () => {
        beforeEach((done) => {
          numPostRequestToError = 1;

          renewer = require('..');
          renewIgnoringFailure(done);
        });

        context('on successful report', () => {
          beforeEach((done) => {
            numPostRequestToError = undefined;
            renewUsage(done);
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
      const startTime = moment.now();

      let errorResponseCode;
      let errorResponseBody;
      let numPostRequestToError;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        let numPostRequests = 0;
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(usageType.events, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined, ++numPostRequests === numPostRequestToError ?
              buildResponse(errorResponseCode, {}, errorResponseBody) :
              buildResponse(201, { location: 'some location' }));
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1', state: usageType.state },
          { _id: 'app2', collector_id: '2', state: usageType.state }
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
              expect(error.op).to.equal('start report');
              expect(error.doc).not.to.equal(undefined);
              expect(error.error).not.to.equal(undefined);
              expect(error.response).to.deep.equal(response);
              expect(response).to.deep.equal(
                buildResponse(errorResponseCode, {}, errorResponseBody)
              );
            },
            success: () => {
              done();
            }
          });
        });

        it('gets the real usage from the COLLECTOR', () => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkGetRequest(args[0], '1');
        });

        it('reports refreshed usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(usageType.events, 0, 'previous'), '1'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(2);
          expect(renewer.statistics.usage.get.failures).to.equal(0);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(false);

          expect(renewer.errors.lastError).
            to.match(/^Failed reporting usage/);
          const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(0);
        });
      });

      context('on the last org usage', () => {
        const startTime = moment.now();
        beforeEach((done) => {
          numPostRequestToError = 2;
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              expect(error.op).to.equal('start report');
              expect(error.doc).not.to.equal(undefined);
              expect(error.error).not.to.equal(undefined);
              expect(error.response).to.deep.equal(response);
              expect(response).to.deep.equal(
                buildResponse(errorResponseCode, {}, errorResponseBody)
              );
            },
            success: () => {
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
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            changeOrgId(generateUsage(usageType.events, 0, 'previous'), '1'));
          checkPostRequest(args[1],
            changeOrgId(generateUsage(usageType.events, 0, 'previous'), '2'));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.get.success).to.equal(2);
          expect(renewer.statistics.usage.get.failures).to.equal(0);
          expect(renewer.statistics.usage.report.success).to.equal(1);
          expect(renewer.statistics.usage.report.conflicts).to.equal(0);
          expect(renewer.statistics.usage.report.failures).to.equal(1);
        });

        it('raises correct reporting errors', () => {
          expect(renewer.errors.noGetEverHappened).to.equal(false);
          expect(renewer.errors.noReportEverHappened).to.equal(false);

          expect(renewer.errors.lastError).
            to.match(/^Failed reporting usage/);
          const errorTime = new moment(renewer.errors.lastErrorTimestamp)
            .valueOf();
          expect(errorTime).to.be.at.least(startTime);

          expect(renewer.errors.consecutiveGetFailures).to.equal(0);
          expect(renewer.errors.consecutiveReportFailures).to.equal(1);
        });
      });

      context('on business error', () => {
        context('on 409 response code', () => {
          beforeEach((done) => {
            numPostRequestToError = 2;
            errorResponseCode = 409;
            errorResponseBody = {
              error: 'conflict',
              reason: 'Conflict. Please retry'
            };

            renewer = require('..');
            renewUsage(done);
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
            checkPostRequest(args[0], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '1')
            );
            checkPostRequest(args[1], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '2')
            );
          });

          it('counts the outcome', () => {

            expect(renewer.statistics.usage.report).to.deep.equal({
              success: 1,
              conflicts: 1,
              failures: 0
            });

            expect(renewer.statistics.usage.get).to.deep.equal({
              success: 2,
              failures: 0,
              missingToken: 0
            });
          });

          it('raises correct reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);

            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(0);
          });
        });

        context('on 409 response code with noretry', () => {
          beforeEach((done) => {
            numPostRequestToError = 2;
            errorResponseCode = 409;
            errorResponseBody = {
              error: 'conflict',
              reason: 'Conflict! Do not retry',
              noretry: true
            };

            renewer = require('..');
            renewUsage(done);
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
            checkPostRequest(args[0], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '1')
            );
            checkPostRequest(args[1], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '2')
            );
          });

          it('counts the outcome', () => {
            expect(renewer.statistics.usage.report).to.deep.equal({
              success: 1,
              conflicts: 1,
              failures: 0
            });

            expect(renewer.statistics.usage.get).to.deep.equal({
              success: 2,
              failures: 0,
              missingToken: 0
            });

          });

          it('raises correct reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);

            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(0);
          });
        });

        context('on 201 response code', () => {
          beforeEach((done) => {
            numPostRequestToError = 2;
            errorResponseCode = 201;
            errorResponseBody = {
              error: 'emplannotfound',
              reason: 'Metering plan with id complex-object-storage not found',
              cause: {
                statusCode: 404
              }
            };

            renewer = require('..');
            renewer.renewUsage(systemToken, {
              failure: (error, response) => {
                expect(error.op).to.equal('start report');
                expect(error.doc).not.to.equal(undefined);
                expect(error.error).not.to.equal(undefined);
                expect(error.response).to.deep.equal(response);
                expect(response).to.deep.equal(
                  buildResponse(errorResponseCode, {}, errorResponseBody)
                );
              },
              success: () => {
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
            expect(args.length).to.equal(2);
            checkPostRequest(args[0], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '1')
            );
            checkPostRequest(args[1], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '2')
            );
          });

          it('counts the outcome', () => {
            expect(renewer.statistics.usage.report).to.deep.equal({
              success: 1,
              conflicts: 0,
              failures: 1
            });

            expect(renewer.statistics.usage.get).to.deep.equal({
              success: 2,
              failures: 0,
              missingToken: 0
            });

          });

          it('raises correct reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);

            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(1);
          });
        });

        context('on 500 response code', () => {
          beforeEach((done) => {
            numPostRequestToError = 2;
            errorResponseCode = 500;
            errorResponseBody = {
              error: 'internal',
              reason: 'Network connectivity problem'
            };

            renewer = require('..');
            renewer.renewUsage(systemToken, {
              failure: (error, response) => {
                expect(error.op).to.equal('start report');
                expect(error.doc).not.to.equal(undefined);
                expect(error.error).not.to.equal(undefined);
                expect(error.response).to.deep.equal(response);
                expect(response).to.deep.equal(
                  buildResponse(errorResponseCode, {}, errorResponseBody)
                );
              },
              success: () => {
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
            expect(args.length).to.equal(2);
            checkPostRequest(args[0], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '1')
            );
            checkPostRequest(args[1], changeOrgId(
              generateUsage(usageType.events, 0, 'previous'), '2')
            );
          });

          it('counts the outcome', () => {
            expect(renewer.statistics.usage.report).to.deep.equal({
              success: 1,
              conflicts: 0,
              failures: 1
            });

            expect(renewer.statistics.usage.get).to.deep.equal({
              success: 2,
              failures: 0,
              missingToken: 0
            });
          });

          it('raises correct reporting errors', () => {
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.noReportEverHappened).to.equal(false);

            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(1);
          });
        });
      });

      context('with failed reporting', () => {
        beforeEach((done) => {
          numPostRequestToError = 1;
          errorResponseCode = 500;

          renewer = require('..');
          renewIgnoringFailure(done);
        });

        context('on successful report', () => {
          beforeEach((done) => {
            numPostRequestToError = undefined;
            errorResponseCode = 201;
            renewUsage(done);
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
            cb(undefined, { statusCode: 200, body: usageType.events });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, {
              statusCode: 201,
              headers: { location: 'some location' },
              body: {}
            });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        dbDocs = buildDbDocs([
          { _id: 'app1', collector_id: '1', state: usageType.state },
          { _id: 'app2', collector_id: '2', state: usageType.state }
        ]);

        process.env.SLACK = '2M';

        renewer = require('..');
        renewUsage(done);
      });

      it('uses it to query the carry-over DB', () => {
        const args = readAllPagesStub.args;
        expect(args.length).to.equal(1);

        // We expect renewer to have a look in the previous month, but
        // because of the 2M slack it will go back 2 * 31 days, to check
        // for usage that was submitted late
        const expectedTimeStamp = moment.utc().subtract(1, 'months')
          .startOf('month').subtract(2 * 31, 'days').valueOf();

        expect(args[0][0].startId).to.contain(expectedTimeStamp);
      });
    });
  });

  context('without usage in db', () => {
    beforeEach((done) => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, { statusCode: 200, body: usageType.events });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 201,
            headers: { location: 'some location' },
            body: {}
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      dbDocs = [];

      renewer = require('..');
      renewUsage(done);
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
      expect(renewer.statistics.usage.get.success).to.equal(0);
      expect(renewer.statistics.usage.get.failures).to.equal(0);
      expect(renewer.statistics.usage.report.success).to.equal(0);
      expect(renewer.statistics.usage.report.conflicts).to.equal(0);
      expect(renewer.statistics.usage.report.failures).to.equal(0);
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
          cb(undefined, { statusCode: 200, body: usageType.events });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, {
            statusCode: 201,
            headers: { location: 'some location' },
            body: {}
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      dbDocs = buildDbDocs([
        { _id: 'app1', collector_id: '1', state: usageType.state },
        { _id: 'app2', collector_id: '2', state: usageType.state }
      ]);

      renewer = require('..');

      startTime = moment.now();
    });

    const runWithSecurity = secured ? context : context.skip;
    const runWithoutSecurity = secured ? context.skip : context;

    runWithSecurity('with security', () => {
      beforeEach((done) => {
        renewer.renewUsage(() => undefined, {
          failure: (error, response) => {
            expect(error).to.equal('Missing token');
            expect(response).to.equal(undefined);
            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });

      it('raises missing token error', () => {
        expect(renewer.errors.missingToken).to.equal(true);
        expect(renewer.errors.lastError).to.equal('Missing token');
        const errorTime = moment.utc(renewer.errors.lastErrorTimestamp)
          .valueOf();
        expect(errorTime).to.be.at.least(startTime);
      });

      it('raises correct error flags', () => {
        expect(renewer.errors.noReportEverHappened).to.equal(true);
        expect(renewer.errors.noGetEverHappened).to.equal(true);
        expect(renewer.errors.consecutiveGetFailures).to.equal(0);
        expect(renewer.errors.consecutiveReportFailures).to.equal(0);
      });

      it('clears error flags on success', (done) => {
        renewer.renewUsage(systemToken, {
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with' +
              ' error %j and response %j', error, response)));
          },
          success: () => {
            expect(renewer.errors.missingToken).to.equal(false);
            expect(renewer.errors.lastError).to.equal('Missing token');
            expect(renewer.errors.noReportEverHappened).to.equal(false);
            expect(renewer.errors.noGetEverHappened).to.equal(false);
            expect(renewer.errors.consecutiveGetFailures).to.equal(0);
            expect(renewer.errors.consecutiveReportFailures).to.equal(0);
            done();
          }
        });
      });

      it('counts the attempts with missing token', () => {
        expect(renewer.statistics.usage.get.missingToken).to.equal(1);
        expect(renewer.statistics.usage.get.success).to.equal(0);
        expect(renewer.statistics.usage.get.failures).to.equal(0);
        expect(renewer.statistics.usage.report.success).to.equal(0);
        expect(renewer.statistics.usage.report.conflicts).to.equal(0);
        expect(renewer.statistics.usage.report.failures).to.equal(0);
      });
    });

    runWithoutSecurity('without security', () => {
      beforeEach((done) => {
        renewUsage(done);
      });

      it('has no attempts with missing token', () => {
        expect(renewer.statistics.usage.get.missingToken).to.equal(0);
      });
    });
  });
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
const serviceUsage = {
  start: 1476878391000,
  end: 1476878391000,
  organization_id: '1',
  space_id: '2',
  consumer_id: 'service:1fb61c1f-2db3-4235-9934-00097845b80d',
  resource_id: 'mongodb',
  plan_id: 'medium',
  resource_instance_id: 'service:medium:1fb61c1f-2db3-4235-9934-00097845b80d',
  measured_usage: [
    {
      measure: 'current_instances',
      quantity: 1
    },
    {
      measure: 'previous_instances',
      quantity: 0
    }
  ],
  processed_id: '0001476878403858-0-0-1-0',
  processed: 1476878403858,
  id: 't/0001476878403858-0-0-1-0/k/anonymous'
};
const usageList = [
  {
    name: 'application',
    events: appUsage,
    state: 'STARTED'
  },
  {
    name: 'service',
    events: serviceUsage,
    state: 'CREATED'
  }
];

for(const secured of [true, false])
  for(const usageType of usageList)
    describe(`Report ${usageType.name} usage ` +
      `${secured ? 'with' : 'without'} security`,
    () => tests(usageType, secured));
