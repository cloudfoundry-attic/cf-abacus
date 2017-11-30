'use strict';

const _ = require('underscore');
const extend = _.extend;
const omit = _.omit;

const moment = require('abacus-moment');

// Configure URLs
process.env.COLLECTOR = 'http://collector';

const testStartTime = moment.now();

const checkErrors = (errors, noReport, expectedReportFailures) => {
  expect(errors).to.include.keys(['lastError', 'lastErrorTimestamp']);
  const noLastKeys = omit(errors, ['lastError', 'lastErrorTimestamp']);
  expect(noLastKeys).to.deep.equal({
    missingToken: false,
    noReportEverHappened: noReport,
    consecutiveReportFailures: expectedReportFailures
  });
};

const tests = (secured) => {
  let reqmock;
  let responseError;
  let responseBody;

  let errors;
  let reporter;

  const token = () => 'token';

  // Delete cached modules exports
  const deleteModules = () => {
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];
  };

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

    // Mock the request module
    const request = require('abacus-request');
    reqmock = extend({}, request, {
      post: spy((uri, opts, cb) => {
        cb(responseError, responseBody);
      })
    });
    require.cache[require.resolve('abacus-request')].exports = reqmock;

    errors = {
      missingToken: false,
      noReportEverHappened: true,
      consecutiveReportFailures: 0,
      lastError: '',
      lastErrorTimestamp: ''
    };
    reporter = require('..')(errors);
  });

  afterEach(() => {
    deleteModules();

    // Unset the SECURED variable
    delete process.env.SECURED;

    reqmock = undefined;
    responseError = undefined;
    responseBody = undefined;
    errors = undefined;
    reporter = undefined;
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

  const checkPostRequest = (req, usage) => {
    expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
    expect(req[1]).to.contain.all.keys('collector', 'body');
    expect(req[1].collector).to.equal(process.env.COLLECTOR);

    expect(req[1].body).to.deep.equal(usage);
  };

  const generateResponse = (code, headers, body = {}) => ({
    statusCode: code,
    headers: headers,
    body: body
  });

  context('success', () => {
    beforeEach((done) => {
      responseError = undefined;
      responseBody = generateResponse(201, { location: 'some location' });

      reporter.reportUsage(appUsage, token, (error, res) => {
        expect(error).to.equal(responseError);
        expect(res).to.equal(responseBody);
        done();
      });
    });

    it('reports usage to COLLECTOR', () => {
      const args = reqmock.post.args;
      expect(args.length).to.equal(1);
      checkPostRequest(args[0], appUsage);
    });

    it('does not raise reporting errors', () => {
      expect(errors).to.deep.equal({
        missingToken: false,
        noReportEverHappened: false,
        consecutiveReportFailures: 0,
        lastError: '',
        lastErrorTimestamp: ''
      });
    });

    context('when location header is missing', () => {
      beforeEach(() => {
        responseError = undefined;
        responseBody = generateResponse(201);

      });

      it('should fail', (done) => {
        reporter.reportUsage(appUsage, token, (error, res) => {
          expect(error).to.be.an('error');
          expect(res).to.eql(undefined);
          done();
        });
      });
    });
  });

  context('failure', () => {
    context('on error during reporting', () => {
      beforeEach((done) => {
        responseError = new Error('error message');
        responseBody = { dummy: 'value' };

        reporter.reportUsage(appUsage, token, (error, res) => {
          expect(error).to.equal(responseError);
          expect(res).to.equal(responseBody);
          done();
        });
      });

      it('tried to reports usage to COLLECTOR', () => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(1);
        checkPostRequest(args[0], appUsage);
      });

      it('raises correct reporting errors', () => {
        checkErrors(errors, true, 1);

        expect(errors.lastError).to.contains(responseError.toString());
        expect(moment.utc(errors.lastErrorTimestamp).valueOf()).to.be.above(
          testStartTime
        );
      });

      it('calls back error function', (done) => {
        const callbackFn = () => {
          done();
        };

        reporter = require('..')(errors, callbackFn);
        expect(reporter.registerError).to.equal(callbackFn);
        reporter.reportUsage(appUsage, token);
      });

      context('after successful report', () => {
        beforeEach((done) => {
          responseError = undefined;
          responseBody = generateResponse(201, { location: 'some location' });

          reporter.reportUsage(appUsage, token, (error, res) => {
            expect(error).to.equal(responseError);
            expect(res).to.equal(responseBody);
            done();
          });
        });

        it('clears reporting errors', () => {
          checkErrors(errors, false, 0);

          expect(errors.lastError).to.not.equal(undefined);
          expect(errors.lastErrorTimestamp).to.not.equal(undefined);
        });
      });
    });

    context('on bad response during reporting', () => {
      beforeEach((done) => {
        responseError = undefined;
        responseBody = generateResponse(500, {}, { blah: 'blah' });

        reporter.reportUsage(appUsage, token, (error, res) => {
          expect(error.message).to.match(/^Failed reporting usage/);
          expect(res).to.equal(responseBody);
          done();
        });
      });

      it('tried to report usage to COLLECTOR', () => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(1);
        checkPostRequest(args[0], appUsage);
      });

      it('raises correct reporting errors', () => {
        checkErrors(errors, true, 1);

        expect(errors.lastError).to.match(/^Failed reporting usage/);
        expect(moment.utc(errors.lastErrorTimestamp).valueOf()).to.be.above(
          testStartTime
        );
      });

      it('calls back error function', (done) => {
        const callbackFn = () => {
          done();
        };

        reporter = require('..')(errors, callbackFn);
        expect(reporter.registerError).to.equal(callbackFn);
        reporter.reportUsage(appUsage, token);
      });

      context('after successful report', () => {
        beforeEach((done) => {
          responseError = undefined;
          responseBody = generateResponse(201, { location: 'some location' });

          reporter.reportUsage(appUsage, token, (error, res) => {
            expect(error).to.equal(responseError);
            expect(res).to.equal(responseBody);
            done();
          });
        });

        it('clears reporting errors', () => {
          checkErrors(errors, false, 0);

          expect(errors.lastError).to.not.equal(undefined);
          expect(errors.lastErrorTimestamp).to.not.equal(undefined);
        });
      });

    });

    context('on business error', () => {
      context('on 409 response code', () => {
        const testConflict = (errorResponseBody, failures) => {
          beforeEach((done) => {
            responseError = undefined;
            responseBody = generateResponse(409, {}, errorResponseBody);

            errors.consecutiveReportFailures = failures;

            reporter.reportUsage(appUsage, token, (error, res) => {
              expect(error).to.equal(undefined);
              expect(res).to.equal(responseBody);
              done();
            });
          });

          it('tried to report usage to COLLECTOR', () => {
            const args = reqmock.post.args;
            expect(args.length).to.equal(1);
            checkPostRequest(args[0], appUsage);
          });

          it('raises correct reporting errors', () => {
            expect(errors).to.deep.equal({
              missingToken: false,
              noReportEverHappened: false,
              consecutiveReportFailures: 0,
              lastError: '',
              lastErrorTimestamp: ''
            });
          });
        };

        context('with retry', () => {
          const errorResponseBody = {
            error: 'conflict',
            reason: 'Conflict. Please retry'
          };

          context('and no pre-existing errors', () =>
            testConflict(errorResponseBody, 0));

          context('and no pre-existing errors', () =>
            testConflict(errorResponseBody, 17));
        });

        context('with noretry', () => {
          const errorResponseBody = {
            error: 'conflict',
            reason: 'Conflict! Do not retry',
            noretry: true
          };

          context('and no pre-existing errors', () =>
            testConflict(errorResponseBody, 0));

          context('and no pre-existing errors', () =>
            testConflict(errorResponseBody, 17));
        });
      });

      context('on 201 response code', () => {
        const errorResponseBody = {
          error: 'emplannotfound',
          reason: 'Metering plan with id complex-object-storage not found',
          cause: {
            statusCode: 404
          }
        };

        beforeEach((done) => {
          responseError = undefined;
          responseBody = generateResponse(201, {}, errorResponseBody);

          reporter.reportUsage(appUsage, token, (error, res) => {
            expect(error).to.deep.equal(errorResponseBody);
            expect(res).to.equal(responseBody);
            done();
          });
        });

        it('tried to report usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
          checkPostRequest(args[0], appUsage);
        });

        it('raises correct reporting errors', () => {
          checkErrors(errors, true, 1);

          expect(errors.lastError).to.match(/^Business error for usage/);
          expect(moment.utc(errors.lastErrorTimestamp).valueOf()).to.be.above(
            testStartTime
          );
        });

        it('calls back error function', (done) => {
          const callbackFn = () => {
            done();
          };

          reporter = require('..')(errors, callbackFn);
          expect(reporter.registerError).to.equal(callbackFn);
          reporter.reportUsage(appUsage, token);
        });

        context('after successful report', () => {
          beforeEach((done) => {
            responseError = undefined;
            responseBody = generateResponse(201, { location: 'some location' });

            reporter.reportUsage(appUsage, token, (error, res) => {
              expect(error).to.equal(responseError);
              expect(res).to.equal(responseBody);
              done();
            });
          });

          it('clears reporting errors', () => {
            checkErrors(errors, false, 0);

            expect(errors.lastError).to.not.equal(undefined);
            expect(errors.lastErrorTimestamp).to.not.equal(undefined);
          });
        });
      });

      context('on 500 response code', () => {
        const errorResponseBody = {
          error: 'internal',
          reason: 'Network connectivity problem'
        };

        beforeEach((done) => {
          responseError = undefined;
          responseBody = generateResponse(500, {}, errorResponseBody);

          reporter.reportUsage(appUsage, token, (error, res) => {
            expect(error).to.deep.equal(errorResponseBody);
            expect(res).to.equal(responseBody);
            done();
          });
        });

        it('tried to report usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
          checkPostRequest(args[0], appUsage);
        });

        it('raises correct reporting errors', () => {
          checkErrors(errors, true, 1);

          expect(errors.lastError).to.match(/^Business error for usage/);
          expect(moment.utc(errors.lastErrorTimestamp).valueOf()).to.be.above(
            testStartTime
          );
        });

        it('calls back error function', (done) => {
          const callbackFn = () => {
            done();
          };

          reporter = require('..')(errors, callbackFn);
          expect(reporter.registerError).to.equal(callbackFn);
          reporter.reportUsage(appUsage, token);
        });

        context('after successful report', () => {
          beforeEach((done) => {
            responseError = undefined;
            responseBody = generateResponse(201, { location: 'some location' });

            reporter.reportUsage(appUsage, token, (error, res) => {
              expect(error).to.equal(responseError);
              expect(res).to.equal(responseBody);
              done();
            });
          });

          it('clears reporting errors', () => {
            checkErrors(errors, false, 0);

            expect(errors.lastError).to.not.equal(undefined);
            expect(errors.lastErrorTimestamp).to.not.equal(undefined);
          });
        });
      });
    });
  });

  context('with missing CF oAuth Token', () => {
    beforeEach(() => {
      responseError = undefined;
      responseBody = generateResponse(201, { location: 'some location' });
    });

    const runWithSecurity = secured ? context : context.skip;

    runWithSecurity('with security', () => {
      beforeEach((done) => {
        reporter.reportUsage(appUsage, () => undefined, (error, response) => {
          expect(error.message).to.equal('Missing resource token');
          expect(response).to.equal(undefined);
          done();
        });
      });

      it('raises correct error flags', () => {
        expect(errors).to.include.keys(['lastError', 'lastErrorTimestamp']);
        const noLastKeys = omit(errors, ['lastError', 'lastErrorTimestamp']);
        expect(noLastKeys).to.deep.equal({
          missingToken: true,
          noReportEverHappened: true,
          consecutiveReportFailures: 0
        });
        expect(errors.lastError).to.match(/^Missing resource token/);
        expect(moment.utc(errors.lastErrorTimestamp).valueOf()).to.be.above(
          testStartTime
        );
      });

      context('on success', () => {
        beforeEach((done) => {
          reporter.reportUsage(appUsage, token, (error, response) => {
            expect(error).to.equal(responseError);
            expect(response).to.equal(responseBody);
            done();
          });
        });

        it('clears error flags', () => {
          checkErrors(errors, false, 0);

          expect(errors.lastError).to.not.equal(undefined);
          expect(errors.lastErrorTimestamp).to.not.equal(undefined);
        });
      });
    });

  });
};

describe('Report usage without security', () => tests(false));

describe('Report usage with security', () => tests(true));
