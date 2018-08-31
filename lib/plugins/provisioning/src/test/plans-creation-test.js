'use strict';

const _ = require('underscore');
const extend = _.extend;
const omit = _.omit;

const request = require('abacus-request');
const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');
const partition = require('abacus-partition');
const utils = require('./utils.js');

process.env.DB = process.env.DB || 'test';

let provisioning;
let server;

const resourceId = '6023c670-8337-4254-bd05-774048942df6';

const uris = urienv({
  DB: 27017
});

require.cache[require.resolve('abacus-cluster')].exports = extend((app) => app, cluster);

const meteringdb = yieldable(dbclient(partition.singleton, dbclient.dburi(uris.db, 'abacus-metering-plans')));

const startProvisioning = () => {
  delete require.cache[require.resolve('..')];
  delete require.cache[require.resolve('../lib/plan-db.js')];

  provisioning = require('..');
  server = provisioning().listen(0);
};

const postRequest = (headers, planType, plan, verifyCb) => {
  request.post(
    'http://localhost::p/v1/:plan_type/plans', {
      p: server.address().port,
      plan_type: planType,
      body: plan,
      headers: headers
    }, (err, val) => {
      expect(err).to.equal(undefined);
      verifyCb(val);
    });
};

const meteringPlan = (prefix = '') => ({
  plan_id: `${prefix}metering-plan-id-${resourceId}`,
  measures: [
    {
      name: 'classifiers',
      unit: 'INSTANCE'
    }
  ],
  metrics: [
    {
      name: 'classifier_instances',
      unit: 'INSTANCE',
      type: 'discrete',
      formula: 'AVG({classifier})'
    }
  ]
});

const testPostOfPlan = (headers, planType, plan, db) => {

  it(`validates creation of new ${planType} plan and errors on dupplicate`,
    (done) => {
      postRequest(headers, planType, plan, (val) => {
        expect(val.statusCode).to.equal(201);

        yieldable.functioncb(function*() {
          const planInDb = yield db.get(['k', plan.plan_id].join('/'));
          expect(omit(planInDb, 'id', '_id', '_rev')).to.deep.equal(plan);
        })((error) => {
          if(error)
            throw error;

          postRequest(headers, planType, plan, (val) => {
            expect(val.statusCode).to.equal(409);
            done();
          });
        });
      });
    });

  it(`validate post of empty ${planType} plan`, (done) => {
    postRequest(headers, planType, {}, (val) => {
      expect(val.statusCode).to.equal(400);
      done();
    });
  });

};

describe('Test plans', () => {

  context('when not secured', () => {

    before(() => {
      process.env.SECURED = false;

      startProvisioning();
    });

    after((done) => dbclient.drop(process.env.DB, /^abacus-metering-plan/, done));

    context('abacus-provisioning-plugin create metering plan',
      () => testPostOfPlan({}, 'metering', meteringPlan(), meteringdb));

  });

  context('when secured', () => {

    before(() => {
      process.env.SECURED = true;
      process.env.JWTKEY = utils.TOKEN_SECRET;
      process.env.JWTALGO = 'HS256';

      startProvisioning();
    });

    after((done) => dbclient.drop(process.env.DB, /^abacus-metering-plan/, done));

    context('and system scope is provided', () => {

      context('abacus-provisioning-plugin create metering plan',
        () => testPostOfPlan(utils.getSystemWriteAuthorization(), 'metering',
          meteringPlan(), meteringdb));

    });

    context('and resource specific scope is provided', () => {

      context('abacus-provisioning-plugin create metering plan',
        () => testPostOfPlan(utils.getResourceWriteAuthorization(resourceId),
          'metering', meteringPlan('res-'), meteringdb));

    });

  });

});
