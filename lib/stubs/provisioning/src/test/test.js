'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');

const extend = _.extend;

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

      const path = {
        region: 'us',
        org_id: '123',
        space_id: '456',
        app_id: '789',
        resource_id: '1234',
        plan_id: 'myplan',
        resource_instance_id: '567'
      };
      request.get(
        'http://localhost::p/v1/provisioning/regions/:region/orgs/:org_id/' +
        'spaces/:space_id/consumers/:app_id/resources/:resource_id/plans/' +
        ':plan_id/instances/:resource_instance_id', extend({
          p: server.address().port
        }, path), (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(path);
          done();
        });
    });
});

