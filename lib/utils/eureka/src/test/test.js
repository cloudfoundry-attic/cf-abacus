'use strict';

// A simple Netflix Eureka client.
const oauth = require('abacus-oauth');
const request = require('abacus-request');

const http = require('http');
const _ = require('underscore');
const extend = _.extend;

process.env.SECURED = 'true';

const getBearerToken = (authServer, username, password, scope, cb) => {
  if(username === 'abacus')
    cb(undefined, 'Bearer AAA');
  else
    cb({ statusCode: 401 }, undefined);
};
const authorize = (token, scope) => {
  expect(scope).to.deep.equal({
    system: ['abacus.system.read']
  });
  expect(token).to.equal('Bearer AAA');
};
const oauthmock = extend({}, oauth, {
  getBearerToken: getBearerToken,
  authorize: authorize
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

const eureka = require('..');

describe('abacus-eureka', () => {
  it('registers services in a Eureka registry', (done) => {

    // Create a test Eureka HTTP server
    const server = http.createServer((req, res) => {
      if(req.url === '/ping' && req.method === 'OPTIONS')
        res.end('okay');

      // Handle the Eureka REST operations
      else if(
        req.url === '/eureka/v2/apps/TEST' && req.method === 'POST') {

        // A test Eureka app instance registration
        const instance = {
          instance: {
            app: 'TEST',
            asgName: 'TEST',
            dataCenterInfo: {
              '@class':
                'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
              name: 'MyOwn'
            },
            hostName: '127.0.0.1',
            ipAddr: '127.0.0.1',
            port: {
              $: 1234,
              '@enabled': true
            },
            metadata: {
              port: 1234
            },
            status: 'UP',
            vipAddress: '127.0.0.1'
          }
        };

        let body = '';
        req.on('data', (chunk) => {
          body = body + chunk;
        });
        req.on('end', () => {
          expect(JSON.parse(body)).to.deep.equal(instance);
          res.statusCode = 200;
          res.end('OK');
        });
      }
      else if(
        req.url === '/eureka/v2/apps/TEST/test-0.0' &&
        req.method === 'DELETE') {
        res.statusCode = 200;
        res.end('OK');
      }
      else if(
        req.url === '/eureka/v2/apps/TEST/test-0.0' &&
        req.method === 'GET') {

        // A test Eureka app instance registration
        const instance = {
          instance: {
            hostName: 'test-0.0',
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
              registrationTimestamp: 1445827972098,
              lastRenewalTimestamp: 1445827972098,
              evictionTimestamp: 0,
              serviceUpTimestamp: 1445827972098
            },
            metadata: {
              '@class': ''
            },
            isCoordinatingDiscoveryServer: false,
            lastUpdatedTimestamp: 1445827972098,
            lastDirtyTimestamp: 1445827972098,
            actionType: 'ADDED'
          }
        };

        res.setHeader('Content-type', 'application/json');
        res.end(JSON.stringify(instance));
      }
      else
        throw new Error('Invalid request');
    });

    // Listen on an ephemeral port
    server.listen(0);

    // Handle callbacks
    let cbs = 0;
    const cb = () => {
      if(++cbs === 3)
        done();
    };

    const s = eureka(request.route('http://localhost::p', {
      p: server.address().port
    }));

    // Register an instance
    eureka.register(s, 'test', '0', '0', '127.0.0.1', 1234, (err, val) => {
      expect(err).to.equal(undefined);
      cb();
    });

    // Lookup an instance
    eureka.instance(s, 'test', '0', '0', (err, val) => {
      expect(err).to.equal(undefined);

      // The expected instance registration
      const instance = {
        app: 'TEST',
        instance: 'test-0.0',
        address: '127.0.0.1',
        port: 1234
      };
      expect(val).to.deep.equal(instance);

      cb();
    });

    // Deregister an instance
    eureka.deregister(s, 'test', '0', '0', (err, val) => {
      expect(err).to.equal(undefined);
      cb();
    });
  });

  it('denies access to unauthorized user', () => {
    const middleware = eureka.health();
    const req = {
      path: '/healthcheck',
      headers: {
        authorization: 'Basic aW52YWxpZDpibGFibGE='
      }
    };
    try {
      middleware(req, undefined, undefined);
    }
    catch (e) {
      expect(e).to.deep.equal({ statusCode: 401 });
    }
  }); 

  it('returns the health of the application', () => {
    const middleware = eureka.health();
    const req = {
      path: '/healthcheck',
      headers: {
        authorization: 'Basic YWJhY3VzOkhTMjU2'
      }
    };
    const res = {
      status: spy(() => res),
      send: spy()
    };
    const next = spy();

    // Expect a status and health report body
    middleware(req, res, next);
    expect(res.status.args[0][0]).to.equal(200);
    expect(res.send.args[0][0]).to.deep.equal({
      healthy: true
    });
    expect(next.args.length).to.equal(0);
  });
});
