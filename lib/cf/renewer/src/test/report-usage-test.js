'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const pick = _.pick;

const moment = require('moment');

// Configure URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';
process.env.PROVISIONING = 'http://provisioning';

const tests = (secured) => {
  let dbEnv;
  let reqmock;
  let renewer;
  let docs;

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

    // Disable the batch, retry and breaker module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;

    // Mock the dbclient module
    const dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    dbclientModule.exports = extend(() => {
      return {
        fname: 'test-mock',
        allDocs: (opt, cb) => {
          cb(undefined, docs);
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

  const stripNormalizedProperties = (normalizedUsage) =>
    pick(normalizedUsage, renewer.resourceUsageSchemaProperties);

  const monthStart = moment().utc().startOf('month').valueOf();

  const checkPostRequest = (req, usage) => {
    expect(req[0]).to.equal(':collector/v1/metering/collected/usage');
    expect(req[1]).to.contain.all.keys('collector', 'body');
    expect(req[1].collector).to.equal(process.env.COLLECTOR);

    const usageToCheck = extend(usage, {
      start: monthStart,
      end: monthStart
    });
    expect(req[1].body).to.deep.equal(usageToCheck);
  };

  const checkGetRequests = (requests, plan) => {
    for (let req of requests) {
      expect(req[0]).to.equal(
        ':provisioning/v1/metering/plans/:metering_plan_id'
      );
      expect(req[1]).to.contain.all.keys(
        'provisioning', 'metering_plan_id', 'cache'
      );
      expect(req[1].provisioning).to.equal(process.env.PROVISIONING);
    }
  };

  context('on non-empty usage event stream', () => {

    context('with single apps', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200, body: linuxContainerPlan });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Usage docs in *descending* order
        docs = {
          rows: [
            { doc: scaledAppUsage }, // last event for app 1
            { doc: stoppedAppUsage },
            { doc: runningAppUsage }
          ]
        };

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

      it('reports resource usage to COLLECTOR', () => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(1);
        checkPostRequest(args[0],
          stripNormalizedProperties(renewer.zeroUsage(scaledAppUsage)));
      });

      it('counts the reported usage', () => {
        expect(renewer.statistics.usage.reportSuccess).to.equal(1);
        expect(renewer.statistics.usage.reportConflict).to.equal(0);
        expect(renewer.statistics.usage.reportFailures).to.equal(0);
      });
    });

    context('with multiple apps', () => {
      const stoppedApp2Usage = changeOrgId(stoppedAppUsage, 2);

      const runningApp3Usage = changeOrgId(runningAppUsage, 3);
      const scaledApp3Usage = changeOrgId(scaledAppUsage, 3);

      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200, body: linuxContainerPlan });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Usage docs in *descending* order
        docs = {
          rows: [
            { doc: scaledAppUsage }, // last event for app 1
            { doc: stoppedAppUsage },
            { doc: runningAppUsage },
            { doc: stoppedApp2Usage }, // last *stop* event for app 2
            { doc: runningApp3Usage }, // last event for app 3
            { doc: scaledApp3Usage }
          ]
        };

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

      it('reports resource usage to COLLECTOR', () => {
        const args = reqmock.post.args;
        expect(args.length).to.equal(2);
        checkPostRequest(args[0],
          stripNormalizedProperties(renewer.zeroUsage(scaledAppUsage)));
        checkPostRequest(args[1],
          stripNormalizedProperties(renewer.zeroUsage(runningApp3Usage)));
      });

      it('counts the reported usage', () => {
        expect(renewer.statistics.usage.reportSuccess).to.equal(2);
        expect(renewer.statistics.usage.reportConflict).to.equal(0);
        expect(renewer.statistics.usage.reportFailures).to.equal(0);
      });
    });

    context('on error during reporting', () => {
      const stoppedApp2Usage = changeOrgId(stoppedAppUsage, 2);

      const runningApp3Usage = changeOrgId(runningAppUsage, 3);
      const scaledApp3Usage = changeOrgId(scaledAppUsage, 3);

      const mockedResponse = { statusCode: 201, body: {} };
      let orgIdToError;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200, body: linuxContainerPlan });
          }),
          post: spy((uri, opts, cb) => {
            cb(opts.body.organization_id === 'us-south:' + orgIdToError ?
              'error' : undefined, mockedResponse);
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Usage docs in *descending* order
        docs = {
          rows: [
            { doc: scaledAppUsage }, // last event for app 1
            { doc: stoppedAppUsage },
            { doc: runningAppUsage },
            { doc: stoppedApp2Usage }, // last *stop* event for app 2
            { doc: runningApp3Usage }, // last event for app 3
            { doc: scaledApp3Usage }
          ]
        };
      });

      context('on the last org usage', () => {
        beforeEach((done) => {
          orgIdToError = 3;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error).to.equal('error');
              expect(response).to.deep.equal(mockedResponse);
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('tried to report all usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            stripNormalizedProperties(renewer.zeroUsage(scaledAppUsage)));
          checkPostRequest(args[1],
            stripNormalizedProperties(renewer.zeroUsage(runningApp3Usage)));
        });

        it('counts the reported usage', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(1);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });
      });

      context('on the first org usage', () => {
        beforeEach((done) => {
          orgIdToError = 1;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error).to.equal('error');
              expect(response).to.deep.equal(mockedResponse);
              done();
            },
            success: () => {
              renewer.stopRenewer();

              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('reports only one usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
          checkPostRequest(args[0],
            stripNormalizedProperties(renewer.zeroUsage(scaledAppUsage)));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });
      });
    });

    context('on bad response during reporting', () => {
      const stoppedApp2Usage = changeOrgId(stoppedAppUsage, 2);

      const runningApp3Usage = changeOrgId(runningAppUsage, 3);
      const scaledApp3Usage = changeOrgId(scaledAppUsage, 3);

      const getResponse = (code) => ({ statusCode: code, body: {} });

      let errorResponseCode;
      let orgIdToError;

      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 200, body: linuxContainerPlan });
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined,
              opts.body.organization_id === 'us-south:' + orgIdToError ?
              getResponse(errorResponseCode) : getResponse(201));
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Usage docs in *descending* order
        docs = {
          rows: [
            { doc: scaledAppUsage }, // last event for app 1
            { doc: stoppedAppUsage },
            { doc: runningAppUsage },
            { doc: stoppedApp2Usage }, // last *stop* event for app 2
            { doc: runningApp3Usage }, // last event for app 3
            { doc: scaledApp3Usage }
          ]
        };
      });

      context('on the last org usage', () => {
        beforeEach((done) => {
          orgIdToError = 3;
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error).to.equal(undefined);
              expect(response).to.deep.equal(getResponse(errorResponseCode));
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('tried to report all usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            stripNormalizedProperties(renewer.zeroUsage(scaledAppUsage)));
          checkPostRequest(args[1],
            stripNormalizedProperties(renewer.zeroUsage(runningApp3Usage)));
        });

        it('counts the reported usage', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(1);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });
      });

      context('on the first org usage', () => {
        beforeEach((done) => {
          orgIdToError = 1;
          errorResponseCode = 500;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();

              expect(error).to.equal(undefined);
              expect(response).to.deep.equal(getResponse(errorResponseCode));
              done();
            },
            success: () => {
              renewer.stopRenewer();

              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('reports only one usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(1);
          checkPostRequest(args[0],
            stripNormalizedProperties(renewer.zeroUsage(scaledAppUsage)));
        });

        it('counts the outcome', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(1);
        });
      });

      context('when 409 is returned', () => {
        beforeEach((done) => {
          orgIdToError = 3;
          errorResponseCode = 409;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();
              done(new Error(util.format('Unexpected call of success with' +
                ' error %j and response %j', error, response)));
            },
            success: () => {
              renewer.stopRenewer();
              done();
            }
          });
        });

        it('tried to report all usage to COLLECTOR', () => {
          const args = reqmock.post.args;
          expect(args.length).to.equal(2);
          checkPostRequest(args[0],
            stripNormalizedProperties(renewer.zeroUsage(scaledAppUsage)));
          checkPostRequest(args[1],
            stripNormalizedProperties(renewer.zeroUsage(runningApp3Usage)));
        });

        it('counts the usage', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(1);
          expect(renewer.statistics.usage.reportConflict).to.equal(1);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
        });
      });
    });

    context('on error during filtering usage', () => {
      const stoppedApp2Usage = changeOrgId(stoppedAppUsage, 2);

      const runningApp3Usage = changeOrgId(runningAppUsage, 3);
      const scaledApp3Usage = changeOrgId(scaledAppUsage, 3);

      const filterError = 'plan get error';

      let requestNumberToError;

      beforeEach(() => {
        // Mock the request module
        let numberOfGetRequests = 0;
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(++numberOfGetRequests === requestNumberToError ?
              filterError : undefined,
              { statusCode: 200, body: linuxContainerPlan });
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Usage docs in *descending* order
        docs = {
          rows: [
            { doc: scaledAppUsage }, // last event for app 1
            { doc: stoppedAppUsage },
            { doc: runningAppUsage },
            { doc: stoppedApp2Usage }, // last *stop* event for app 2
            { doc: runningApp3Usage }, // last event for app 3
            { doc: scaledApp3Usage }
          ]
        };
      });

      context('on the last usage', () => {
        beforeEach((done) => {
          requestNumberToError = 6;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error) => {
              renewer.stopRenewer();

              expect(error).to.equal(filterError);
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('did not report any usage to COLLECTOR', () => {
          const postArgs = reqmock.post.args;
          expect(postArgs.length).to.equal(0);
        });

        it('fetched all the usage plans it could', () => {
          const getArgs = reqmock.get.args;
          expect(getArgs.length).to.equal(requestNumberToError);
          checkGetRequests(getArgs, linuxContainerPlan);
        });

        it('counts the plan get attempts', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
          expect(renewer.statistics.plan.getSuccess).to.equal(
            requestNumberToError - 1
          );
          expect(renewer.statistics.plan.getFailures).to.equal(1);
        });
      });

      context('on the first usage', () => {
        beforeEach((done) => {
          requestNumberToError = 1;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error) => {
              renewer.stopRenewer();

              expect(error).to.equal(filterError);
              done();
            },
            success: () => {
              renewer.stopRenewer();

              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('did not report any usage to COLLECTOR', () => {
          const postArgs = reqmock.post.args;
          expect(postArgs.length).to.equal(0);
        });

        it('fetched all the usage plans it could', () => {
          const getArgs = reqmock.get.args;
          expect(getArgs.length).to.equal(requestNumberToError);
          checkGetRequests(getArgs, linuxContainerPlan);
        });

        it('counts the plan get attempts', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
          expect(renewer.statistics.plan.getSuccess).to.equal(
            requestNumberToError - 1
          );
          expect(renewer.statistics.plan.getFailures).to.equal(1);
        });
      });
    });

    context('on bad response during filtering usage', () => {
      const stoppedApp2Usage = changeOrgId(stoppedAppUsage, 2);

      const runningApp3Usage = changeOrgId(runningAppUsage, 3);
      const scaledApp3Usage = changeOrgId(scaledAppUsage, 3);

      let requestNumberToError;

      beforeEach(() => {
        // Mock the request module
        let requestNum = 0;
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (++requestNum === requestNumberToError)
              cb(undefined, { statusCode: 500 });
            else
              cb(undefined, { statusCode: 200, body: linuxContainerPlan });
          }),
          post: spy((uri, opts, cb) => {
            cb(undefined, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Usage docs in *descending* order
        docs = {
          rows: [
            { doc: scaledAppUsage }, // last event for app 1
            { doc: stoppedAppUsage },
            { doc: runningAppUsage },
            { doc: stoppedApp2Usage }, // last *stop* event for app 2
            { doc: runningApp3Usage }, // last event for app 3
            { doc: scaledApp3Usage }
          ]
        };
      });

      context('on the last usage', () => {
        beforeEach((done) => {
          requestNumberToError = 6;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error) => {
              renewer.stopRenewer();

              expect(error).not.to.equal(undefined);
              done();
            },
            success: () => {
              renewer.stopRenewer();
              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('did not report any usage to COLLECTOR', () => {
          const postArgs = reqmock.post.args;
          expect(postArgs.length).to.equal(0);
        });

        it('fetched all the usage plans it could', () => {
          const getArgs = reqmock.get.args;
          expect(getArgs.length).to.equal(requestNumberToError);
          checkGetRequests(getArgs, linuxContainerPlan);
        });

        it('counts the plan get attempts', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
          expect(renewer.statistics.plan.getSuccess).to.equal(
            requestNumberToError - 1
          );
          expect(renewer.statistics.plan.getFailures).to.equal(1);
        });
      });

      context('on the first usage', () => {
        beforeEach((done) => {
          requestNumberToError = 1;

          renewer = require('..');
          renewer.renewUsage(systemToken, {
            failure: (error) => {
              renewer.stopRenewer();

              expect(error).not.to.equal(undefined);
              done();
            },
            success: () => {
              renewer.stopRenewer();

              done(new Error('Unexpected call of success'));
            }
          });
        });

        it('did not report any usage to COLLECTOR', () => {
          const postArgs = reqmock.post.args;
          expect(postArgs.length).to.equal(0);
        });

        it('fetched all the usage plans it could', () => {
          const getArgs = reqmock.get.args;
          expect(getArgs.length).to.equal(requestNumberToError);
          checkGetRequests(getArgs, linuxContainerPlan);
        });

        it('counts the plan get attempts', () => {
          expect(renewer.statistics.usage.reportSuccess).to.equal(0);
          expect(renewer.statistics.usage.reportConflict).to.equal(0);
          expect(renewer.statistics.usage.reportFailures).to.equal(0);
          expect(renewer.statistics.plan.getSuccess).to.equal(
            requestNumberToError - 1
          );
          expect(renewer.statistics.plan.getFailures).to.equal(1);
        });
      });
    });
  });

  context('on empty usage event stream', () => {
    beforeEach((done) => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, { statusCode: 200, body: linuxContainerPlan });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      docs = { rows: [] };

      renewer = require('..');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %j and response %j', error, response)));
        },
        success: () => {
          renewer.stopRenewer();
          done();
        }
      });
    });

    it('does not report any usage to COLLECTOR', () => {
      const args = reqmock.post.args;
      expect(args.length).to.equal(0);
    });

    it('counts the reported usage', () => {
      expect(renewer.statistics.usage.reportSuccess).to.equal(0);
      expect(renewer.statistics.usage.reportConflict).to.equal(0);
      expect(renewer.statistics.usage.reportFailures).to.equal(0);
    });
  });

  context('with missing CF oAuth Token', () => {
    beforeEach(() => {
      // Mock the request module
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, { statusCode: 200, body: linuxContainerPlan });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      // Usage docs in *descending* order
      docs = {
        rows: [
          { doc: scaledAppUsage }, // last event for app 1
          { doc: stoppedAppUsage },
          { doc: runningAppUsage }
        ]
      };

      renewer = require('..');
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

    runWithSecurity('counts the attempts with missing token', (done) => {
      renewer.renewUsage(() => undefined, {
        failure: () => {
          renewer.stopRenewer();

          expect(renewer.statistics.usage.missingToken).to.equal(1);
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
          done(new Error(util.format('Unexpected call of success with' +
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
          done(new Error(util.format('Unexpected call of success with' +
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
