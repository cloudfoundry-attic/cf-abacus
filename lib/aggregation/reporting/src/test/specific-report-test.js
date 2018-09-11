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

process.env.DB_ACCUMULATOR_URI = process.env.DB_URI;
process.env.DB_AGGREGATOR_URI = process.env.DB_URI;

process.env.CLUSTER = 'false';
const testResourceId = 'resource-1';
let report = require('..');

mocker.mockRequestModule();
mocker.mockClusterModule();
mocker.mockOAuthModule();

// Convenient test case:
// Space A, consumer A, plan basic basic/basic/basic
const planAUsage = builder.buildAggregatedUsage(
  1,
  100,
  300,
  {
    consumed: 475200000,
    consuming: 6
  },
  {
    consumed: 10843200000,
    consuming: 6
  },
  1,
  3,
  45,
  { price: 0.00014 },
  undefined,
  undefined,
  undefined,
  true
);

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

process.env.SECURED = 'true';
process.env.JWTKEY = tokenSecret;
process.env.JWTALGO = tokenAlgorithm;

describe('Abacus usage specific report', () => {
  let server;

  const deleteModules = () => {
    delete require.cache[require.resolve('abacus-oauth')];
    delete require.cache[require.resolve('..')];
  };

  before((done) => {
    deleteModules();
    report = require('..');
    done();
  });

  context('on extracting org usage', () => {
    const orgUsage = {
      organization_id: '5308227d-9e7f-48fb-8db7-1f0680c49491',
      account_id: '1234',
      start: 1420502400000,
      end: 1420502400010,
      processed: 1420502400020,
      id: 'k/5308227d-9e7f-48fb-8db7-1f0680c49491/t/0001420502400000',
      consumer_id: 'app:3653384d-4754-4802-a44c-9fd363204660',
      resource_id: 'resource-1',
      processed_id: '1420502400020-4-0-1-0',
      plan_id: 'basic',
      resources: [
        {
          resource_id: 'resource-1',
          plans: [builder.buildPlanUsage('basic', planAUsage)]
        },
        {
          resource_id: 'resource-2',
          plans: [builder.buildPlanUsage('basic', planAUsage)]
        }
      ],
      spaces: [
        {
          space_id: 'space1',
          resources: [
            {
              resource_id: 'resource-1',
              plans: [builder.buildPlanUsage('basic', planAUsage)]
            },
            {
              resource_id: 'resource-2',
              plans: [builder.buildPlanUsage('basic', planAUsage)]
            }
          ],
          consumers: [
            {
              id: 'app:3653384d-4754-4802-a44c-9fd363204660',
              t: '0001502371509001'
            }
          ]
        }
      ]
    };

    const consumerUsage = {
      organization_id: '5308227d-9e7f-48fb-8db7-1f0680c49491',
      account_id: '1234',
      start: 1420502400000,
      end: 1420502400010,
      processed: 1420502400020,
      id:
        'k/5308227d-9e7f-48fb-8db7-1f0680c49491/space1/' +
        'app:3653384d-4754-4802-a44c-9fd363204660/t/0001502371509001',
      consumer_id: 'app:3653384d-4754-4802-a44c-9fd363204660',
      resource_id: 'resource-1',
      processed_id: '1420502400020-4-0-1-0',
      plan_id: 'basic',
      resources: [
        {
          resource_id: 'resource-1',
          plans: [builder.buildPlanUsage('basic', planAUsage)]
        },
        {
          resource_id: 'resource-2',
          plans: [builder.buildPlanUsage('basic', planAUsage)]
        }
      ]
    };

    before((done) => {
      dbclient.drop(process.env.DB_URI, /^abacus-aggregator|^abacus-accumulator/, () => {
        storage.aggregator.put(orgUsage, () =>
          storage.aggregator.put(consumerUsage, () => {
            done();
          })
        );
      });
    });

    beforeEach(() => {
      const app = report();
      server = app.listen(0);
    });

    it('with system token', (done) => {
      const signedToken = jwt.sign(extend(tokenPayload, { scope: ['abacus.usage.read'] }), tokenSecret, {
        expiresIn: 43200
      });
      const headers = {
        headers: {
          authorization: 'bearer ' + signedToken
        }
      };
      request.get(
        'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage/:time',
        extend(headers, {
          p: server.address().port,
          organization_id: '5308227d-9e7f-48fb-8db7-1f0680c49491',
          time: 1420502400000
        }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body.resources.length).to.equal(2);
          expect(val.body.spaces[0].resources.length).to.equal(2);
          expect(val.body.spaces[0].consumers[0].resources.length).to.equal(2);
          done();
        }
      );
    });

    it('with resource specific token', (done) => {
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
      request.get(
        'http://localhost::p/v1/metering/organizations/' + ':organization_id/aggregated/usage/:time',
        extend(headers, {
          p: server.address().port,
          organization_id: '5308227d-9e7f-48fb-8db7-1f0680c49491',
          time: 1420502400000
        }),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body.resources.length).to.equal(1);
          expect(val.body.spaces[0].resources.length).to.equal(1);
          expect(val.body.spaces[0].consumers[0].resources.length).to.equal(1);
          done();
        }
      );
    });
  });
});
