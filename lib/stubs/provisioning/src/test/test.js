'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const schemas = require('abacus-usage-schemas');

const extend = _.extend;
const map = _.map;

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const provisioning = require('..');

describe('abacus-provisioning-stub', () => {
  it('returns provisioned resource instance info by ' +
    'region/org/space/app/resource/plan/instance', (done) => {
      // Create a test provisioning app
      const app = provisioning();

      // Listen on an ephemeral port
      const server = app.listen(0);

      // Validate a valid provisioned resource instance
      const valid = {
        region: 'us',
        org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_id: 'object-storage',
        plan_id: 'basic',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        time: 1420070400000
      };
      request.get(
        'http://localhost::p/v1/provisioning/regions/:region/orgs/:org_id/' +
        'spaces/:space_id/consumers/:consumer_id/resources/:resource_id/' +
        'plans/:plan_id/instances/:resource_instance_id/:time', extend({
          p: server.address().port
        }, valid), (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(valid);
          done();
        });

      // Reject an invalid provisioned resource instance, this one uses
      // an invalid resource_id
      const invalid = {
        region: 'us',
        org_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
        space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
        consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab',
        resource_id: 'invalid-resource',
        plan_id: 'basic',
        resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
        time: 1420070400000
      };
      request.get(
        'http://localhost::p/v1/provisioning/regions/:region/orgs/:org_id/' +
        'spaces/:space_id/consumers/:consumer_id/resources/:resource_id/' +
        'plans/:plan_id/instances/:resource_instance_id/:time', extend({
          p: server.address().port
        }, invalid), (err, val) => {
          expect(err).to.not.equal(undefined);
          expect(err.statusCode).to.equal(404);
          done();
        });
    });

  it('returns available resource configs', (done) => {
    // Create a test provisioning app
    const app = provisioning();

    // Listen on an ephemeral port
    const server = app.listen(0);

    request.get(
      'http://localhost::p/v1/provisioning/resource/config' +
      '/:resource_id/:time', {
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

  it('validates all resource configurations', () => {
    map(['analytics', 'object-storage', 'linux-container'], (name) => {
      console.log('    validating', name, ' resource');
      const conf = require('../resources/' + name);
      expect(schemas.resourceConfig.validate(conf)).to.deep.equal(conf);
      console.log('        validated', name, ' resource');
    });
  });
});

