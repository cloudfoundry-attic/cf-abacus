'use strict';

const _ = require('underscore');
const jwt = require('jsonwebtoken');
const request = require('abacus-request');
const express = require('abacus-express');

const map = _.map;
const extend = _.extend;

const tokenSecret = '2DCQ@#R!Cyhj7nbs4t4fWbb34b';
const tokenAlgorithm = 'HS256';

const encodedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJmYTFiMjlmZS03NmE' +
  '5LTRjMmQtOTAzZS1kZGRkMDU2M2E5ZTMiLCJzdWIiOiJydW50aW1lZXh0IiwiYXV0aG9' +
  'yaXRpZXMiOlsic2NpbS5yZWFkIiwidWFhLnJlc291cmNlIiwib3BlbmlkIiwiY2xvdWR' +
  'fY29udHJvbGxlci5yZWFkIiwic2VydmljZV9icm9rZXIiXSwic2NvcGUiOlsic2NpbS5' +
  'yZWFkIiwidWFhLnJlc291cmNlIiwib3BlbmlkIiwiY2xvdWRfY29udHJvbGxlci5yZWF' +
  'kIl0sImNsaWVudF9pZCI6InJ1bnRpbWVleHQiLCJjaWQiOiJydW50aW1lZXh0IiwiYXp' +
  'wIjoicnVudGltZWV4dCIsImdyYW50X3R5cGUiOiJjbGllbnRfY3JlZGVudGlhbHMiLCJ' +
  'pYXQiOjE0NDA0NjQzMjksImV4cCI6MTQ0MDUwNzUyOSwiaXNzIjoiaHR0cHM6Ly91YWE' +
  'uY2YubmV0L29hdXRoL3Rva2VuIiwiemlkIjoidWFhIiwiYXVkIjpbInJ1bnRpbWVleHQ' +
  'iLCJzY2ltIiwiY2xvdWRfY29udHJvbGxlciIsInVhYSIsIm9wZW5pZCJdfQ.XscT83dP' +
  'U5pNXODiS0gWJUd0e7OorEQWK6-VFrcmG3s';

const decodedToken = {
  header: {
    alg: tokenAlgorithm
  },
  payload: {
    jti: 'fa1b29fe-76a9-4c2d-903e-dddd0563a9e3',
    sub: 'runtimeext',
    authorities: [
      'scim.read',
      'uaa.resource',
      'openid',
      'cloud_controller.read',
      'service_broker'
    ],
    scope: [
      'scim.read',
      'uaa.resource',
      'openid',
      'cloud_controller.read'
    ],
    client_id: 'runtimeext',
    cid: 'runtimeext',
    azp: 'runtimeext',
    grant_type: 'client_credentials',
    iat: 1440464329,
    exp: 1440507529,
    iss: 'https://uaa.cf.net/oauth/token',
    zid: 'uaa',
    aud: [
      'runtimeext',
      'scim',
      'cloud_controller',
      'uaa',
      'openid'
    ]
  },
  signature: 'XscT83dPU5pNXODiS0gWJUd0e7OorEQWK6-VFrcmG3s'
};

const encodedUserToken = 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiI1NTU1NTU1NS02' +
  'NjY2LTc3NzctODg4OC05OTk5OTk5OTk5OTkiLCJzdWIiOiIxMTExMTExMS0yMjIyLTMz' +
  'MzMtNDQ0NC0wMDAwMDAwMDAwMDAiLCJzY29wZSI6WyJwYXNzd29yZC53cml0ZSIsIm9w' +
  'ZW5pZCIsImNsb3VkX2NvbnRyb2xsZXIud3JpdGUiLCJjbG91ZF9jb250cm9sbGVyLnJl' +
  'YWQiXSwiY2xpZW50X2lkIjoiY2YiLCJjaWQiOiJjZiIsImF6cCI6ImNmIiwiZ3JhbnRf' +
  'dHlwZSI6InBhc3N3b3JkIiwidXNlcl9pZCI6IjExMTExMTExLTIyMjItMzMzMy00NDQ0' +
  'LTAwMDAwMDAwMDAwMCIsInVzZXJfbmFtZSI6InVzZXJAY2Yub3JnIiwiZW1haWwiOiJ1' +
  'c2VyQGNmLm9yZyIsImlhdCI6MTQ0MDQ2MjU0MCwiZXhwIjoxNDQwNTA1NzQwLCJpc3Mi' +
  'OiJodHRwOi8vdWFhLmNmLmNvbS9vYXV0aC90b2tlbiIsImF1ZCI6WyJvcGVuaWQiLCJj' +
  'bG91ZF9jb250cm9sbGVyIiwicGFzc3dvcmQiLCJjZiJdfQ.WD1dxkXslvFL8TF87NezU' +
  'EtZ7EYk7kAHZ0LlXfwvdAs';

const oauth = require('..');

describe('abacus-oauth', () => {
  it('authenticate requests using validator middleware', (done) => {
    // Create a test Express application
    const app = express();

    // Add oauth validator middleware
    app.use(oauth.validator(tokenSecret, tokenAlgorithm));

    // Get a protected resource
    app.get('/protected/resource', (req, res) => {
      res.send('okay');
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const cb = () => {
      if (++cbs === 3) done();
    };

    // Request the protected resource without oauth token
    request.get('http://localhost::port/protected/resource', {
      port: server.address().port
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(401);
      expect(val.headers['www-authenticate']).to.equal('Bearer realm="cf"');
      cb();
    });

    // Request the protected resource using an oauth token with
    // invalid signature
    request.get('http://localhost::port/protected/resource', {
      port: server.address().port,
      auth: {
        bearer: encodedUserToken
      }
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(401);
      expect(val.headers['www-authenticate']).to.equal('Bearer realm="cf",' +
        ' error="invalid_token",' +
        ' error_description="invalid signature"');
      cb();
    });

    // Sign a known token using default algorithm (HS256)
    const signed = jwt.sign(decodedToken.payload, tokenSecret, {
      expiresIn: 43200
    });

    // Request the protected resource using a vaid oauth token
    request.get('http://localhost::port/protected/resource', {
      port: server.address().port,
      auth: {
        bearer: signed
      }
    }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(200);
      expect(val.headers['www-authenticate']).to.equal(undefined);
      expect(val.body).to.equal('okay');
      cb();
    });
  });

  it('Authorize OAuth bearer access token using expected scopes', () => {

    // Default OAuth bearer access token
    const token = {
      jti: 'fa1b29fe-76a9-4c2d-903e-dddd0563a9e3',
      sub: 'test-token',
      client_id: 'test-token',
      cid: 'test-token',
      azp: 'test-token',
      grant_type: 'client_credentials',
      iss: 'https://uaa.cf.net/oauth/token',
      zid: 'uaa',
      aud: [
        'abacus',
        'account'
      ]
    };

    // signed OAUTH bearer access token with resource scopes and system scopes
    const auth = 'Bearer ' + jwt.sign(extend(token, {
      authorities: [
        'resource1.write', 'resource2.write', 'system1.write', 'system2.write'
      ],
      scope: [
        'resource1.write', 'resource2.write', 'system1.write', 'system2.write'
      ]
    }), tokenSecret, {
      expiresIn: 43200
    });

    // Authorization not required
    oauth.authorize(auth, undefined);
    oauth.authorize(auth, {});

    // Have resource authorization
    oauth.authorize(auth, {
      resource: ['resource1.write']
    });

    // Have resources authorization
    oauth.authorize(auth, {
      resource: ['resource1.write', 'resource2.write']
    });

    // Have system authorization
    oauth.authorize(auth, {
      resource: [],
      system: ['system1.write']
    });

    // Have system aurhtorization but not resource authorization
    oauth.authorize(auth, {
      resource: ['resource3.write'],
      system: ['system1.write']
    });

    // Have one of the system authorization
    oauth.authorize(auth, {
      resource: ['resource3.write'],
      system: ['system1.write', 'system3.write']
    });

    // Malformed OAuth access token
    try {
      oauth.authorize('malformed token', {
        resource: ['resource1.write', 'resource2.write', 'resource3.write']
      });
      expect(undefined).to.not.equal(undefined);
    }
    catch (err) {
      expect(err).to.deep.equal({
        statusCode: 401,
        header: {
          'WWW-Authenticate': 'Bearer realm="cf", error="invalid_token",' +
            ' error_description="malformed"'
        }
      });
    }

    const error = {
      statusCode: 403,
      header: {
        'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope",' +
          ' error_description="resource1.write,resource2.write,resource3.write"'
      }
    };

    // Does not have one of the resource authorizations
    try {
      oauth.authorize(auth, {
        resource: ['resource1.write', 'resource2.write', 'resource3.write']
      });
      expect(undefined).to.not.equal(undefined);
    }
    catch (err) {
      expect(err).to.deep.equal(error);
    }

    // Does not have resource and system authorizations
    try {
      oauth.authorize(auth, {
        resource: ['resource1.write', 'resource2.write', 'resource3.write'],
        system: ['system3.write']
      });
      expect(undefined).to.not.equal(undefined);
    }
    catch (err) {
      expect(err).to.deep.equal(error);
    }

    // Does not have system authorization
    try {
      oauth.authorize(auth, {
        resource: [],
        system: ['system3.write']
      });
      expect(undefined).to.not.equal(undefined);
    }
    catch (err) {
      expect(err).to.deep.equal(extend({}, error, {
        header: {
          'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope",' +
          ' error_description=""'
        }
      }));
    }

    // Does not have system authorization
    try {
      oauth.authorize(auth, {
        system: ['system3.write']
      });
      expect(undefined).to.not.equal(undefined);
    }
    catch (err) {
      expect(err).to.deep.equal(extend({}, error, {
        header: {
          'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope",' +
          ' error_description=""'
        }
      }));
    }
  });

  it('get OAuth bearer access token using cache', (done) => {
    // Create a test Express application
    const app = express();

    // Add auth server REST endpoints
    app.get('/v2/info', (req, res) => {
      res.send({
        token_endpoint: [req.protocol, '://', req.headers.host].join('')
      });
    });

    app.get('/oauth/token', (req, res) => {
      if (req.query.scope === 'invalid') {
        res.status(400).end();
        return;
      }

      res.send({ access_token: 'AAA', token_type: 'bearer', expires_in: 1 });
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Unable to get a token from auth server's token endpoint
    const invalidtoken = oauth.cache('http://localhost:' +
      server.address().port, 'valid', 'secret', 'invalid');

    invalidtoken.start((err) => {
      expect(err).to.deep.equal(new Error('Unable to get OAUTH token'));
      expect(invalidtoken()).to.equal(undefined);

      // Now try a valid token and let it expire and refresh the token

      // Setup a fake time
      const clock = sinon.useFakeTimers(Date.now(),
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');

      const validToken = oauth.cache('http://localhost:' +
        server.address().port, 'valid', 'secret', 'scopes');

      validToken.start((err) => {
        expect(err).to.equal(undefined);
        expect(validToken()).to.equal('Bearer AAA');

        // Let the token to be refreshed
        clock.tick(1000 * 3600 * 2 + 1);
        expect(validToken()).to.equal('Bearer AAA');

        // restore the clock
        clock.restore();

        done();
      });
    });
  });

  it('authorization server responds with errors', (done) => {
    // Create a test Express application
    const app = express();

    let queries = 0;
    // Add auth server REST endpoints
    app.get('/v2/info', (req, res) => {
      queries++;

      if (queries === 1)
        res.status(404).end();
      else if (queries === 2)
        res.send({ message: 'returning invalid data' });
      else if (queries === 3)
        res.send({
          token_endpoint: [req.protocol, '://', req.headers.host].join('')
        });
      else
        res.status(500).end();
    });

    app.get('/oauth/token', (req, res) => {
      res.status(500).end();
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const cb = () => {
      if (++cbs === 4) done();
    };

    map([1, 2, 3, 4], () => {
      const token = oauth.cache('http://localhost:' +
        server.address().port, 'user', 'secret', 'scope');

      token.start((err) => {
        expect([
          'Error: Unable to get oauth server information',
          'Error: Unable to get token endpoint from oauth server',
          'Error: HTTP response status code 500'
        ]).to.deep.include(err.toString());
        expect(token()).to.equal(undefined);

        cb();
      });
    });
  });

  it('Get user information', () => {
    // Get user information and validate it
    const user = oauth.getUserInfo(encodedUserToken);
    expect(user).to.deep.equal({
      user_id: '11111111-2222-3333-4444-000000000000',
      user_name: 'user@cf.org'
    });

    // Get client information and validate it
    const client = oauth.getUserInfo(encodedToken);
    expect(client).to.deep.equal({
      client_id: 'runtimeext'
    });
  });

  it('Decode basic token', () => {
    const user = oauth.decodeBasicToken('Basic YWJhY3VzOkhTMjU2');
    expect(user).to.deep.equal(['abacus', 'HS256']);
    try {
      oauth.decodeBasicToken('Basic a');
    }
    catch(e) {
      expect(e.statusCode).to.equal(401);
    }
  });

  it('Get bearer access token', (done) => {
    // Create a test Express application
    const app = express();

    // Add auth server REST endpoints
    app.get('/v2/info', (req, res) => {
      res.send({
        token_endpoint: [req.protocol, '://', req.headers.host].join('')
      });
    });

    app.get('/oauth/token', (req, res) => {
      if (req.query.scope === 'invalid') {
        res.status(400).end();
        return;
      }

      res.send({ access_token: 'AAA', token_type: 'bearer', expires_in: 1 });
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    oauth.getBearerToken('http://localhost:' +
      server.address().port, 'abacus', 'HS256', 'abacus.system.read',
      (err, token) => {
        expect(err).to.equal(undefined);
        expect(token).to.equal('Bearer AAA');
        oauth.getBearerToken('http://localhost:' +
        server.address().port, 'abacus', 'HS256', 'invalid',
        (err, token) => {
          expect(err).to.deep.equal(new Error('Unable to get OAUTH token'));
          expect(token).to.equal(undefined);
          done();
        });
      });
  });
});
