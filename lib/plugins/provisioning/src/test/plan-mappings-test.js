'use strict';

const _ = require('underscore');
const extend = _.extend;
const utils = require('./utils.js');

const cluster = require('abacus-cluster');
const dbclient = require('abacus-dbclient');
const request = require('abacus-request');
const mappings = require('abacus-plan-mappings');

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

describe('abacus-provisioning-plugin', () => {
  let provisioning;

  const cleanUp = (done) => {
    dbclient.drop(process.env.DB_URI,
      /^abacus-rating-plan|^abacus-pricing-plan|^abacus-metering-plan/, done);
  };

  before((done) => {
    delete require.cache[require.resolve('..')];
    provisioning = require('..');

    cleanUp(done);
  });

  context('manages mappings', () => {
    let port;

    const readMapping = (mappingType, resourceType, planName, expectedPlanId,
      header, done) => {
      request.get(
        'http://localhost::p/v1/provisioning/mappings/:mapping_type/' +
        'resources/:resource_type/plans/:plan_name', {
          p: port,
          mapping_type: mappingType,
          resource_type: resourceType,
          plan_name: planName,
          headers: header
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal({ plan_id: expectedPlanId });
          done();
        });
    };

    const createMapping = (mappingType, expectedPlanId, header, planName,
      done) => {
      request.post(
        'http://localhost::p/v1/provisioning/mappings/:mapping_type/' +
        'resources/:resource_type/plans/:plan_name/:plan_id', {
          p: port,
          mapping_type: mappingType,
          resource_type: 'object-storage',
          plan_name: planName,
          plan_id: expectedPlanId,
          headers: header
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          readMapping(mappingType, 'object-storage', planName,
            expectedPlanId, header, done);
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
        createMapping('metering', 'basic-object-storage', {}, 'default', done);
      });

      it('rating mapping', (done) => {
        createMapping('rating', 'basic-object-storage', {}, 'default', done);
      });

      it('pricing mapping', (done) => {
        createMapping('pricing', 'basic-object-storage', {}, 'default', done);
      });

    });

    context('when secured', () => {

      const systemHeader = utils.getSystemAuthorization();
      const dummyResourceHeader = utils.getResourceAuthorization('dummy');

      const createMapingWithoutScopes = (mappingType, done) => {
        request.post(
          'http://localhost::p/v1/provisioning/mappings/:mapping_type/' +
            'resources/:resource_type/plans/:plan_name/:plan_id', {
            p: port,
            mapping_type: mappingType,
            resource_type: 'object-storage',
            plan_name: 'default',
            plan_id: 'basic-object-storage',
            headers: dummyResourceHeader
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(403);
            done();
          });
      };

      const readMapingWithoutScopes = (mappingType, done) => {
        request.get(
          'http://localhost::p/v1/provisioning/mappings/:mapping_type/' +
          'resources/:resource_type/plans/:plan_name', {
            p: port,
            mapping_type: mappingType,
            resource_type: 'object-storage',
            plan_name: 'default',
            headers: dummyResourceHeader
          }, (err, val) => {
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
        createMapping('metering', 'basic-object-storage', systemHeader,
          'standard', done);
      });

      it('create and read rating mapping', (done) => {
        createMapping('rating', 'basic-object-storage', systemHeader,
          'standard', done);
      });

      it('create and read pricing mapping', (done) => {
        createMapping('pricing', 'basic-object-storage', systemHeader,
          'standard', done);
      });

      it('create metering mapping with non system scope', (done) => {
        createMapingWithoutScopes('metering', done);
      });

      it('create pricing mapping with non system scope', (done) => {
        createMapingWithoutScopes('pricing', done);
      });

      it('create rating mapping with non system scope', (done) => {
        createMapingWithoutScopes('rating', done);
      });

      it('read metering mapping with non system scope', (done) => {
        readMapingWithoutScopes('metering', done);
      });

      it('read pricing mapping with non system scope', (done) => {
        readMapingWithoutScopes('pricing', done);
      });

      it('read rating mapping with non system scope', (done) => {
        readMapingWithoutScopes('rating', done);
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
        readMapping('metering', 'object-storage', 'basic',
          'basic-object-storage', {}, done);
      });

      it('store rating mappings', (done) => {
        readMapping('rating', 'object-storage', 'basic',
          'object-rating-plan', {}, done);
      });

      it('store pricing mappings', (done) => {
        readMapping('pricing', 'object-storage', 'basic',
          'object-pricing-basic', {}, done);
      });

    });

  });

});

