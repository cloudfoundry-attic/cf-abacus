'use strict';

const _ = require('underscore');
const extend = _.extend;
const utils = require('./utils.js');

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const request = require('abacus-request');
const mappings = require('abacus-plan-mappings');

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

describe('abacus-provisioning-plugin', () => {
  let provisioning;

  const cleanUp = (done) => dbclient.drop(process.env.DB, /^abacus-metering-plan/, done);

  before((done) => {
    delete require.cache[require.resolve('..')];
    provisioning = require('..');

    cleanUp(done);
  });

  context('manages mappings', () => {
    let port;

    const readMapping = (resourceType, planName, expectedPlanId, header, done) => {
      request.get(
        'http://localhost::p/v1/provisioning/mappings/metering/resources/:resource_type/plans/:plan_name',
        {
          p: port,
          resource_type: resourceType,
          plan_name: planName,
          headers: header
        },
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal({ plan_id: expectedPlanId });
          done();
        });
    };

    const createMapping = (expectedPlanId, header, planName, done) => {
      request.post(
        'http://localhost::p/v1/provisioning/mappings/metering/' +
        'resources/:resource_type/plans/:plan_name/:plan_id', {
          p: port,
          resource_type: 'object-storage',
          plan_name: planName,
          plan_id: expectedPlanId,
          headers: header
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          readMapping('object-storage', planName, expectedPlanId, header, done);
        });
    };


    const startProvisioning = () => {
      const app = provisioning();
      const server = app.listen(0);
      port = server.address().port;
    };

    context('when not secured', () => {

      before(() => {
        process.env.SECURED = 'false';

        startProvisioning();
      });

      after(() => {
        delete process.env.SECURED;
      });

      it('metering mapping', (done) => {
        createMapping('basic-object-storage', {}, 'default', done);
      });

    });

    context('when secured', () => {

      const systemHeader = utils.getSystemAuthorization();
      const dummyResourceHeader = utils.getResourceAuthorization('dummy');

      const createMapingWithoutScopes = (done) => {
        request.post(
          'http://localhost::p/v1/provisioning/mappings/metering/resources/:resource_type/plans/:plan_name/:plan_id',
          {
            p: port,
            resource_type: 'object-storage',
            plan_name: 'default',
            plan_id: 'basic-object-storage',
            headers: dummyResourceHeader
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(403);
            done();
          });
      };

      const readMapingWithoutScopes = (done) => {
        request.get(
          'http://localhost::p/v1/provisioning/mappings/metering/resources/:resource_type/plans/:plan_name',
          {
            p: port,
            resource_type: 'object-storage',
            plan_name: 'default',
            headers: dummyResourceHeader
          },
          (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(403);
            done();
          });
      };

      before(() => {
        process.env.SECURED = 'true';
        process.env.JWTKEY = utils.TOKEN_SECRET;
        process.env.JWTALGO = 'HS256';

        startProvisioning();
      });

      after(() => {
        delete process.env.SECURED;
        delete process.env.JWTKEY;
        delete process.env.JWTALGO;
      });

      it('create and read metering mapping', (done) => {
        createMapping('basic-object-storage', systemHeader, 'standard', done);
      });

      it('create metering mapping with non system scope', (done) => {
        createMapingWithoutScopes(done);
      });

      it('read metering mapping with non system scope', (done) => {
        readMapingWithoutScopes(done);
      });

    });

    context('pre-defined', () => {

      before((done) => {
        mappings.storeDefaultMappings(() => {
          const app = provisioning();
          const server = app.listen(0);
          port = server.address().port;
          done();
        });
      });

      it('store metering mappings', (done) => {
        readMapping('object-storage', 'basic', 'basic-object-storage', {}, done);
      });

    });

  });

});

