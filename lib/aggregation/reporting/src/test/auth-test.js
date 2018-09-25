'use strict';

// Usage reporting service.

const _ = require('underscore');
const jwt = require('jsonwebtoken');
const request = require('abacus-request');
const dbclient = require('abacus-dbclient');

const extend = _.extend;
const builder = require('./helper/builder.js');
const storage = require('./helper/storage.js');
const mocker = require('./helper/mocker.js');

const testResourceId = 'test-resource-id';

mocker.mockRequestModule();
mocker.mockClusterModule();
mocker.mockOAuthModule();

const sid = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
const cid = (p) => p !== 'standard' ? 'UNKNOWN' : 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';
const rid = '0b39fa70-a65f-4183-bae8-385633ca5c87';

// Convenient test case:
// Space A, consumer A, plan basic basic/basic/basic
const planAUsage = builder.buildAggregatedUsage({
  storage: 1,
  lightCalls: 100,
  heavyCalls: 300,
  dailyMemory: { consumed: 475200000, consuming: 6 },
  monthlyMemory: { consumed: 10843200000, consuming: 6 },
  addSummary: true
});

const tokenSecret = 'secret';
const tokenAlgorithm = 'HS256';
const tokenPayload = {
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-usage-reporting',
  authorities: ['abacus.usage.read'],
  scope: ['abacus.usage.read'],
  client_id: 'abacus-usage-reporting',
  cid: 'abacus-usage-reporting',
  azp: 'abacus-usage-reporting',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: ['abacus-usage-reporting', 'abacus.usage']
};

const orgUsagePath = '/v1/metering/organizations/:organization_id/aggregated/usage/:time';

const resInstanceUsagePath =
  '/v1/metering/organizations/:organization_id/spaces/:space_id/resource_id/:resource_id/' +
  'resource_instances/:resource_instance_id/consumers/:consumer_id/plans/' +
  ':plan_id/metering_plans/:metering_plan_id/rating_plans/:rating_plan_id/' +
  'pricing_plans/:pricing_plan_id/t/:t/aggregated/usage/:time';

const queryPath = '/v1/metering/aggregated/usage/graph/:query';

const oid2 = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';

const orgUsageParams = {
  organization_id: oid2,
  time: 1420574400000
};

const resInstanceUsageParams = {
  organization_id: oid2,
  space_id: sid,
  resource_instance_id: rid,
  resource_id: testResourceId,
  consumer_id: 'UNKNOWN',
  plan_id: 'basic',
  metering_plan_id: 'test-metering-plan',
  rating_plan_id: 'test-rating-plan',
  pricing_plan_id: 'test-pricing-basic',
  t: '0001446418800000',
  time: 1446418800000
};

const query = `{
 organization(organization_id: "${oid2}", time: 1420574400000) {
   organization_id,
   resources {
     resource_id,
     plans {
       plan_id
       aggregated_usage {
         metric,
         windows {
           summary
         }
       }
     }
   }
 }
}`;

process.env.SECURED = 'true';
process.env.JWTKEY = tokenSecret;
process.env.JWTALGO = tokenAlgorithm;

describe('abacus-usage-report-auth', () => {
  let report;
  let server;

  const deleteModules = () => {
    delete require.cache[require.resolve('abacus-oauth')];
    delete require.cache[require.resolve('..')];
  };

  const prepareRatedUsage = (done) => {
    const id = `k/${oid2}/t/0001420502400000`;
    const rated = builder.ratedTemplate(
      id,
      oid2,
      sid,
      testResourceId,
      1420502400000,
      1420502500000,
      1420502500000,
      builder.buildAggregatedUsage({
        storage: 21,
        lightCalls: 300,
        heavyCalls: 3300,
        dailyMemory: { consumed: 1108800000, consuming: 14 },
        monthlyMemory: { consumed: 25300800000, consuming: 14 },
        addSummary: true
      }),
      [builder.buildPlanUsage('basic', planAUsage)],
      [builder.consumerReferenceTemplate(1420502500000, 'UNKNOWN')]
    );
    const consumer1 = builder.ratedConsumerTemplate(
      oid2,
      sid,
      cid,
      testResourceId,
      1420502400000,
      1420502500000,
      'basic',
      builder.buildAggregatedUsage({
        storage: 1,
        lightCalls: 100,
        heavyCalls: 300,
        dailyMemory: { consumed: 475200000, consuming: 6 },
        monthlyMemory: { consumed: 10843200000, consuming: 6 },
        addSummary: true
      }),
      [builder.buildPlanUsage('basic', planAUsage)],
      1420502500000
    );

    storage.aggregator.put(rated, () => storage.aggregator.put(consumer1, done));
  };

  const prepareAccumulatedUsage = (done) => {
    const accumulated = builder.accumulatedTemplate(
      oid2,
      rid,
      sid,
      testResourceId,
      builder.buildAccumulatedUsage({
        storage: { current: 1 },
        lightCalls: { current: 1 },
        heavyCalls: { current: 100 }
      })
    );
    storage.accumulator.put(accumulated, done);
  };

  before((done) => {
    deleteModules();
    report = require('..');

    dbclient.drop(process.env.DB_URI, /^abacus-aggregator|^abacus-accumulator/, () =>
      prepareRatedUsage(() => prepareAccumulatedUsage(done))
    );
  });

  beforeEach(() => {
    const app = report();
    server = app.listen(0);
  });

  context('with a valid token that has a system scope', () => {
    const signedToken = jwt.sign(tokenPayload, tokenSecret, { expiresIn: 43200 });
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('succeeds when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get(
        'http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        }
      );
    });

    it('succeeds when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        }
      );
    });

    it('succeeds when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        }
      );
    });
  });

  context('with a valid token that has a correct resource scope', () => {
    const signedToken = jwt.sign(
      extend(tokenPayload, { scope: [`abacus.usage.${testResourceId}.read`] }),
      tokenSecret,
      { expiresIn: 43200 }
    );
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('succeeds when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get(
        'http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        }
      );
    });

    it('succeeds when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          done();
        }
      );
    });

    it('fails when 403 retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        }
      );
    });
  });

  context('with a valid token that has an incorrect resource scope', () => {
    const signedToken = jwt.sign(extend(tokenPayload, { scope: ['abacus.usage.test-resource-2.read'] }), tokenSecret, {
      expiresIn: 43200
    });
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('fails with 403 when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        }
      );
    });

    it('fails with 403 when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        }
      );
    });
  });

  context('with a valid token that doesnt have any scopes', () => {
    const signedToken = jwt.sign(extend(tokenPayload, { scope: [] }), tokenSecret, { expiresIn: 43200 });
    const headers = {
      headers: {
        authorization: 'bearer ' + signedToken
      }
    };

    it('fails with 403 when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get(
        'http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        }
      );
    });

    it('fails with 403 when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        }
      );
    });

    it('fails with 403 when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(403);
          done();
        }
      );
    });
  });

  context('with no token', () => {
    const headers = {
      headers: {}
    };

    it('fails with 401 when retrieving usage for an organization', (done) => {
      // Attempt to get the usage for an organization
      request.get(
        'http://localhost::p' + orgUsagePath,
        extend(orgUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          done();
        }
      );
    });

    it('fails with 401 when retrieving usage for a res. instance', (done) => {
      // Attempt to get the usage for an organization
      request.get(
        'http://localhost::p' + resInstanceUsagePath,
        extend(resInstanceUsageParams, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          done();
        }
      );
    });

    it('fails with 401 when retrieving usage via a query', (done) => {
      // Attempt to get the usage for a resource instance
      request.get(
        'http://localhost::p' + queryPath,
        extend({ query: query }, headers, { p: server.address().port }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          done();
        }
      );
    });
  });
});
