'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const oauth = require('abacus-cfoauth');
const schemas = require('abacus-usage-schemas');

const extend = _.extend;
const map = _.map;

// Configure test db URL prefix
process.env.COUCHDB = process.env.COUCHDB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-cfoauth')].exports = oauthmock;

const provisioning = require('..');

describe('abacus-provisioning-stub', () => {
  it('returns resource instance info by ' +
    'org/space/app/resource/plan/instance', (done) => {
      const verify = (secured, done) => {
        process.env.SECURED = secured ? 'true' : 'false';
        oauthspy.reset();

        // Create a test provisioning app
        const app = provisioning();

        // Listen on an ephemeral port
        const server = app.listen(0);

        let cbs = 0;
        const cb = () => {
          if(++cbs === 2) {
            // Check oauth validator spy
            expect(oauthspy.callCount).to.equal(secured ? 2 : 0);

            done();
          }
        };

        // Validate a valid provisioned resource instance
        const valid = {
          org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'object-storage',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          time: 1420070400000
        };

        request.get(
          'http://localhost::p/v1/provisioning/orgs/:org_id/' +
          'spaces/:space_id/consumers/:consumer_id/resources/:resource_id/' +
          'plans/:plan_id/instances/:resource_instance_id/:time', extend({
            p: server.address().port
          }, valid), (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(200);
            expect(val.body).to.deep.equal(valid);
            cb();
          });

        // Reject an invalid provisioned resource instance, this one uses
        // an invalid resource_id
        const invalid = {
          org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
          space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
          consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
          resource_id: 'invalid-resource',
          plan_id: 'basic',
          resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
          time: 1420070400000
        };

        request.get(
          'http://localhost::p/v1/provisioning/orgs/:org_id/' +
          'spaces/:space_id/consumers/:consumer_id/resources/:resource_id/' +
          'plans/:plan_id/instances/:resource_instance_id/:time', extend({
            p: server.address().port
          }, invalid), (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(404);
            cb();
          });
      };

      // Verify using an unsecured server and then verify using a secured server
      verify(false, () => verify(true, done));
    });

  it('returns available resource configs', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    request.get(
      'http://localhost::p/v1/provisioning/resources' +
      '/:resource_id/config/:time', {
        p: server.address().port,
        resource_id: 'object-storage',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(
          require('../resources/object-storage'));
        done();
      });
  });

  it('validates all test resource configurations', () => {
    map([
      'analytics',
      'object-storage',
      'linux-container',
      'test-resource'
    ], (name) => {
      console.log('    validating', name, ' resource');
      const conf = require('../resources/' + name);
      expect(schemas.resourceConfig.validate(conf)).to.deep.equal(conf);
      console.log('        validated', name, ' resource');
    });
  });

  it('validates creation of new resource configurations', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Validate a valid provisioned test resource config
    const resourceConfig = {
      'resource_id': 'test',
      'effective': 1420070400000,
      'measures': [
        {
          'name': 'classifiers',
          'unit': 'INSTANCE'
        }
      ],
      'metrics': [
        {
          'name': 'classifier_instances',
          'unit': 'INSTANCE',
          'formula': 'AVG({classifier})'
        }
      ]
    };

    let expected = 4;
    const checkDone = () => {
      expected--;
      if (expected === 0)
        done();
    };

    const validGetRequest = function(resourceConfig) {
      request.get(
        'http://localhost::p/v1/provisioning/resources/:resource_id/' +
        'config/:time', {
          p: server.address().port,
          resource_id: resourceConfig.resource_id,
          time: 1420070400000
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(resourceConfig);
          checkDone();
        });
    };

    const invalidGetRequest = function(resourceConfig) {
      request.get(
        'http://localhost::p/v1/provisioning/resources/:resource_id/' +
        'config/:time', {
          p: server.address().port,
          resource_id: resourceConfig.resource_id,
          time: 1420070300000
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(404);
          checkDone();
        });
    };

    const postRequest = function(resourceConfig) {
      request.post(
        'http://localhost::p/v1/provisioning/resources/:resource_id/config', {
          p: server.address().port,
          resource_id: resourceConfig.resource_id,
          body: resourceConfig
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(204);
          checkDone();
          validGetRequest(resourceConfig);
          invalidGetRequest(resourceConfig);
        });
    };
    postRequest(resourceConfig);
    request.post(
      'http://localhost::p/v1/provisioning/resources/:resource_id/config', {
        p: server.address().port,
        resource_id: 'test',
        body: {}
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(400);
        checkDone();
      });
  });
});
