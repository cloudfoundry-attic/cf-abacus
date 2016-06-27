'use strict';

// Minimalistic plugin for a Eureka compatible service registry.

const _ = require('underscore');
const request = require('abacus-request');
const cluster = require('abacus-cluster');
const oauth = require('abacus-oauth');
const dbclient = require('abacus-dbclient');

const extend = _.extend;

// Configure test db URL prefix
process.env.DB = process.env.DB || 'test';

// Mock the cluster module
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const eureka = require('..');

describe('abacus-eureka-plugin', () => {
  before((done) => {
    // Delete test dbs on the configured db server
    dbclient.drop(process.env.DB, /^abacus-app-instances/, done);
  });

  let clock;
  const now = Date.now();
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers(now, 'Date');
  });
  afterEach(() => {
    // Restore original timers
    clock.restore();
  });

  it('provides a Eureka compatible service', (done) => {
    delete process.env.SECURED;
    oauthspy.reset();

    // Create a Eureka registry plugin application
    const app = eureka();

    // Listen on an ephemeral port
    const server = app.listen(0);

    // A test Eureka app instance registration
    const instance = {
      instance: {
        app: 'TEST',
        dataCenterInfo: {
          name: 'MyOwn'
        },
        hostName: 'test.0',
        ipAddr: '127.0.0.1',
        port: 1234,
        status: 'UP',
        vipAddress: '127.0.0.1'
      }
    };
    
    // Register an app instance
    request.post('http://localhost::p/eureka/v2/apps/:app', {
      p: server.address().port,
      app: 'TEST',
      body: instance
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(201);

      // Lookup the app instance
      request.get('http://localhost::p/eureka/v2/apps/:app/:instance', {
        p: server.address().port,
        app: 'TEST',
        instance: 'test.0'
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);

        // A test Eureka app instance registration
        const instance = {
          instance: {
            hostName: 'test.0',
            app: 'TEST',
            ipAddr: '127.0.0.1',
            vipAddress: '127.0.0.1',
            status: 'UP',
            overriddenstatus: 'UNKNOWN',
            port: {
              '@enabled': 'true',
              '$': '1234'
            },
            securePort: {
              '@enabled': 'false',
              '$': '7002'
            },
            countryId: 1,
            dataCenterInfo: {
              '@class': '',
              name: 'MyOwn'
            },
            leaseInfo: {
              renewalIntervalInSecs: 30,
              durationInSecs: 90,
              registrationTimestamp: now,
              lastRenewalTimestamp: now,
              evictionTimestamp: 0,
              serviceUpTimestamp: now
            },
            metadata: {
              '@class': ''
            },
            isCoordinatingDiscoveryServer: false,
            lastUpdatedTimestamp: now,
            lastDirtyTimestamp: now,
            actionType: 'ADDED'
          }
        };
        expect(val.body).to.deep.equal(instance);

        // Delete it
        request.delete('http://localhost::p/eureka/v2/apps/:app/:instance', {
          p: server.address().port,
          app: 'TEST',
          instance: 'test.0'
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);

          // Lookup the app instance again
          request.get('http://localhost::p/eureka/v2/apps/:app/:instance', {
            p: server.address().port,
            app: 'TEST',
            instance: 'test.0'
          }, (err, val) => {
            expect(err).to.equal(undefined);
            expect(val.statusCode).to.equal(404);
            expect(val.body).to.equal(undefined);

            // Check oauth validator spy
            expect(oauthspy.callCount).to.equal(0);

            done();
          });
        });
      });
    });
  });
});
