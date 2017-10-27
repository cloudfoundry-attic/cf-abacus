'use strict';

const _ = require('underscore');
const jwt = require('jsonwebtoken');
const request = require('abacus-request');
const express = require('abacus-express');
const moment = require('abacus-moment');

const map = _.map;
const extend = _.extend;

const tokenSecret = '2DCQ@#R!Cyhj7nbs4t4fWbb34b';
const tokenAlgorithm = 'HS256';

const invalidClientToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJmYTFiMjlmZS03NmE' +
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

const invalidUserToken =
  'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiI1NTU1NTU1NS02' +
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

const signToken = (authorities, scopes) => {
  const payload = extend({
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
  },{
    authorities: authorities,
    scope: scopes
  });
  return jwt.sign(payload, tokenSecret, {
    expiresIn: 43200
  });
};

describe('abacus-oauth', () => {
  const oauth = require('..');

  describe('parseTokenScope', () => {
    it('should extract the resource from the scope', () => {
      const token = signToken([], [
        'abacus.usage.test-resource.read',
        'abacus.usage.test-resource.write',
        'some.other.scope'
      ]);
      const scopes = oauth.parseTokenScope(token);
      expect(scopes).not.to.equal(undefined);
      expect(scopes.hasSystemReadScope).to.equal(false);
      expect(scopes.hasSystemWriteScope).to.equal(false);
      expect(scopes.readResourceScopes).to.deep.equal(['test-resource']);
      expect(scopes.writeResourceScopes).to.deep.equal(['test-resource']);
    });

    it('should extract the system scope', () => {
      const token = signToken([], [
        'abacus.usage.read',
        'abacus.usage.write'
      ]);
      const scopes = oauth.parseTokenScope(token);
      expect(scopes).not.to.equal(undefined);
      expect(scopes.hasSystemReadScope).to.equal(true);
      expect(scopes.hasSystemWriteScope).to.equal(true);
      expect(scopes.readResourceScopes.length).to.equal(0);
      expect(scopes.writeResourceScopes.length).to.equal(0);
    });

    it('should fail with incorrect scope', () => {
      const token = signToken([], [
        'some.other.scope'
      ]);
      const scopes = oauth.parseTokenScope(token);
      expect(scopes).not.to.equal(undefined);
      expect(scopes.hasSystemReadScope).to.equal(false);
      expect(scopes.hasSystemWriteScope).to.equal(false);
      expect(scopes.readResourceScopes.length).to.equal(0);
      expect(scopes.writeResourceScopes.length).to.equal(0);
    });

    it('should extract system read and resource write scopes', () => {
      const token = signToken([], [
        'abacus.usage.read',
        'abacus.usage.test-resource.write'
      ]);
      const scopes = oauth.parseTokenScope(token);
      expect(scopes).not.to.equal(undefined);
      expect(scopes.hasSystemReadScope).to.equal(true);
      expect(scopes.hasSystemWriteScope).to.equal(false);
      expect(scopes.readResourceScopes.length).to.equal(0);
      expect(scopes.writeResourceScopes).to.deep.equal([ 'test-resource' ]);
    });
  });

  describe('validator', () => {
    let server;

    beforeEach((done) => {
      const app = express();
      app.use(oauth.validator(tokenSecret, tokenAlgorithm));
      app.get('/protected/resource', (req, res) => {
        res.send('okay');
      });
      server = app.listen(0, done);
    });

    afterEach(() => {
      server.close();
    });

    it('rejects calls with a missing token', (done) => {
      request.get('http://localhost::port/protected/resource', {
        port: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(401);
        expect(val.headers['www-authenticate']).to.equal('Bearer realm="cf"');
        done();
      });
    });

    it('rejects calls with a token with invalid signature', (done) => {
      request.get('http://localhost::port/protected/resource', {
        port: server.address().port,
        auth: {
          bearer: invalidUserToken
        }
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(401);
        expect(val.headers['www-authenticate']).to.equal(
          'Bearer realm="cf",' +
          ' error="invalid_token",' +
          ' error_description="invalid signature"'
        );
        done();
      });
    });

    it('allows calls with a valid token', (done) => {
      const token = signToken([], []);
      request.get('http://localhost::port/protected/resource', {
        port: server.address().port,
        auth: {
          bearer: token
        }
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.headers['www-authenticate']).to.equal(undefined);
        expect(val.body).to.equal('okay');
        done();
      });
    });
  });

  describe('authorizer', () => {
    let server;

    beforeEach((done) => {
      const app = express();
      app.use(
        oauth.authorizer(tokenSecret, tokenAlgorithm, ['read', 'write'])
      );
      app.get('/protected/resource', (req, res) => {
        res.send('okay');
      });
      server = app.listen(0, done);
    });

    afterEach(() => {
      server.close();
    });

    it('rejects calls with a missing token', (done) => {
      request.get('http://localhost::port/protected/resource', {
        port: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(401);
        expect(val.headers['www-authenticate']).to.equal('Bearer realm="cf"');
        done();
      });
    });

    it('rejects calls with a token with invalid signature', (done) => {
      request.get('http://localhost::port/protected/resource', {
        port: server.address().port,
        auth: {
          bearer: invalidUserToken
        }
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(401);
        expect(val.headers['www-authenticate']).to.equal('Bearer realm="cf",' +
          ' error="invalid_token",' +
          ' error_description="invalid signature"');
        done();
      });
    });

    it('rejects calls with a token with insufficient scopes', (done) => {
      const token = signToken([], []);
      request.get('http://localhost::port/protected/resource', {
        port: server.address().port,
        auth: {
          bearer: token
        }
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(403);
        expect(val.headers['www-authenticate']).to.equal(
          'Bearer realm="cf",' +
          ' error="insufficient_scope",' +
          ' error_description="read,write"'
        );
        done();
      });
    });

    it('allows calls with a token with required scopes', (done) => {
      const token = signToken([], [
        'read',
        'write',
        'other'
      ]);
      request.get('http://localhost::port/protected/resource', {
        port: server.address().port,
        auth: {
          bearer: token
        }
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.headers['www-authenticate']).to.equal(undefined);
        expect(val.body).to.equal('okay');
        done();
      });
    });
  });

  describe('authorize', () => {
    const assertFails = (func, cb) => {
      let thrown = false;
      try {
        func();
      }
      catch (err) {
        cb(err);
        thrown = true;
      }
      expect(thrown).to.equal(true);
    };

    const authorities = [
      'resource.write', 'resource.read', 'system.write', 'system.read'
    ];
    const scopes = authorities;
    const token = signToken(authorities, scopes);
    const authHeader = `Bearer ${token}`;

    const expectedError = {
      statusCode: 403,
      header: {
        'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope",' +
          ' error_description="resource.write,resource.read,resource.missing"'
      }
    };

    it('passes when no scopes defined', () => {
      oauth.authorize(authHeader, undefined);
    });

    it('passes when empty scopes defined', () => {
      oauth.authorize(authHeader, {});
    });

    it('passes when all requested (single) resource scopes contained', () => {
      oauth.authorize(authHeader, {
        resource: ['resource.write']
      });
    });

    it('passes when all requested (multiple) resource scopes contained', () => {
      oauth.authorize(authHeader, {
        resource: ['resource.write', 'resource.read']
      });
    });

    it('passes when requested system scope contained', () => {
      oauth.authorize(authHeader, {
        resource: [],
        system: ['system.write']
      });
    });

    // eslint-disable-next-line max-len
    it('passes when requested system scope contained, regardless of resource scopes', () => {
      oauth.authorize(authHeader, {
        resource: ['missing.write'],
        system: ['system.write']
      });
    });

    // eslint-disable-next-line max-len
    it('passes when at least one system scope is contained, regardless of resource scopes ', () => {
      oauth.authorize(authHeader, {
        resource: ['missing.write'],
        system: ['system.write', 'system.missing']
      });
    });

    it('fails when malformed token is passed', () => {
      assertFails(() => {
        oauth.authorize('Bearer gibberish', {
          resource: ['resource.write']
        });
      }, (err) => {
        expect(err).to.deep.equal({
          statusCode: 401,
          header: {
            'WWW-Authenticate': 'Bearer realm="cf", error="invalid_token",' +
              ' error_description="malformed"'
          }
        });
      });
    });

    it('fails when one of resource scopes is missing', () => {
      assertFails(() => {
        oauth.authorize(authHeader, {
          resource: ['resource.write', 'resource.read', 'resource.missing']
        });
      }, (err) => {
        expect(err).to.deep.equal(expectedError);
      });
    });

    it('fails when does not have resource and system scopes', () => {
      assertFails(() => {
        oauth.authorize(authHeader, {
          resource: ['resource.write', 'resource.read', 'resource.missing'],
          system: ['system.missing']
        });
      }, (err) => {
        expect(err).to.deep.equal(expectedError);
      });
    });

    // eslint-disable-next-line max-len
    it('fails when system scope is missing and resource scopes are empty', () => {
      assertFails(() => {
        oauth.authorize(authHeader, {
          resource: [],
          system: ['system.missing']
        });
      }, (err) => {
        expect(err).to.deep.equal(extend({}, expectedError, {
          header: {
            'WWW-Authenticate':
            'Bearer realm="cf", error="insufficient_scope",' +
            ' error_description=""'
          }
        }));
      });
    });

    it('fails when system scope is missing', () => {
      assertFails(() => {
        oauth.authorize(authHeader, {
          system: ['system.missing']
        });
      }, (err) => {
        expect(err).to.deep.equal(extend({}, expectedError, {
          header: {
            'WWW-Authenticate':
            'Bearer realm="cf", error="insufficient_scope",' +
            ' error_description=""'
          }
        }));
      });
    });
  });

  const checkTokens = (invalidToken, validToken, callsCount, expectedCallsCount,
    done) => {
    invalidToken.start((err) => {
      expect(err).to.deep.equal(new Error('Unable to get OAuth token'));
      expect(invalidToken()).to.equal(undefined);

      // Now try a valid token and let it expire and refresh the token

      // Setup a fake time
      const clock = sinon.useFakeTimers(moment.now(),
        'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');

      validToken.start((err) => {
        expect(err).to.equal(undefined);
        expect(validToken()).to.equal('Bearer AAA');

        // Let the token be refreshed
        clock.tick(1000 * 3600 * 2 + 1);
        expect(validToken()).to.equal('Bearer AAA');

        // restore the clock
        clock.restore();

        // Check calls to the authorization server endpoint
        if (callsCount)
          expect(callsCount()).to.equal(expectedCallsCount);

        done();
      });
    });
  };

  it('get OAuth bearer access token using cache', (done) => {
    // Create a test Express application
    const app = express();

    // Add auth server REST endpoints
    let callsCount = 0;
    app.get('/v2/info', (req, res) => {
      callsCount++;
      res.send({
        token_endpoint: [req.protocol, '://', req.headers.host].join('')
      });
    });

    app.post('/oauth/token', (req, res) => {
      if (req.query.scope === 'invalid') {
        res.status(400).end();
        return;
      }

      res.send({ access_token: 'AAA', token_type: 'bearer', expires_in: 1 });
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Unable to get a token from auth server's token endpoint
    const invalidToken = oauth.cache('http://localhost:' +
      server.address().port, 'valid', 'secret', 'invalid');

    const validToken = oauth.cache('http://localhost:' +
      server.address().port, 'valid', 'secret', 'scopes');

    checkTokens(invalidToken, validToken, () => callsCount, 1, () => {
      server.close();
      done();
    });
  });

  it('get OAuth bearer access token using cache directly', (done) => {
    // Create a test Express application
    const app = express();

    app.post('/oauth2/api/v1/token', (req, res) => {
      if (req.query.scope === 'invalid') {
        res.status(400).end();
        return;
      }

      res.send({ access_token: 'AAA', token_type: 'bearer', expires_in: 1 });
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    // Unable to get a token from auth server's token endpoint
    const invalidToken = oauth.cache('http://localhost:' +
      server.address().port, 'valid', 'secret', 'invalid',
    'oauth2/api/v1/token', false);

    const validToken = oauth.cache('http://localhost:' +
      server.address().port, 'valid', 'secret', 'scopes',
    'oauth2/api/v1/token', false);

    checkTokens(invalidToken, validToken, undefined, undefined, () => {
      server.close();
      done();
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

    app.post('/oauth/token', (req, res) => {
      res.status(500).end();
    });

    // Listen on an ephemeral port
    const server = app.listen(0);

    let cbs = 0;
    const cb = () => {
      if (++cbs === 4) {
        server.close();
        done();
      }
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
    const user = oauth.getUserInfo(invalidUserToken);
    expect(user).to.deep.equal({
      user_id: '11111111-2222-3333-4444-000000000000',
      user_name: 'user@cf.org'
    });

    const client = oauth.getUserInfo(invalidClientToken);
    expect(client).to.deep.equal({
      client_id: 'runtimeext'
    });
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

    app.post('/oauth/token', (req, res) => {
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

  context('when using basic authentication strategy', () => {
    const encodedCredentials = 'dXNlcjpwYXNzCg==';

    const authHeader = (value) => {
      return { headers: { Authorization: value } };
    };

    const requestOpts = (port, headers) => {
      return extend({ port: port }, headers);
    };

    let server;
    let oauthTokenResponse = { access_token: signToken(['abacus.system.read'],
      ['abacus.system.read']), token_type: 'bearer', expires_in: 1 };

    beforeEach(() => {
      const api = express();
      api.get('/v2/info', (req, res) => {
        res.send({ token_endpoint: [req.protocol, '://',
          req.headers.host].join('') });
      });
      api.post('/oauth/token', (req, res) => {
        if (typeof oauthTokenResponse === 'number')
          res.sendStatus(oauthTokenResponse);
        else
          res.send(oauthTokenResponse);
      });
      const apiServer = api.listen(0);

      const app = express();
      app.use(oauth.basicStrategy('http://localhost:' +
        apiServer.address().port, 'abacus.system.read',
      tokenSecret, tokenAlgorithm));

      app.get('/protected/resource', (req, res) => {
        res.send('okay');
      });

      server = app.listen(0);
    });

    afterEach(() => {
      server.close();
    });

    it('should reject when token is malformed', (done) => {
      request.get('http://localhost::port/protected/resource',
        requestOpts(server.address().port, authHeader('Basic invalid')),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          expect(val.headers['www-authenticate']).to.equal('Basic realm="cf",' +
          ' error="invalid_token",' +
          ' error_description="malformed"');
          done();
        });
    });

    it('should reject when no auth header is provided', (done) => {
      request.get('http://localhost::port/protected/resource',
        requestOpts(server.address().port),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          expect(val.headers['www-authenticate']).to.equal('Basic realm="cf"');
          done();
        });
    });

    it('should return body with valid auth', (done) => {
      request.get('http://localhost::port/protected/resource',
        requestOpts(server.address().port,
          authHeader(`Basic ${encodedCredentials}`)),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.equal('okay');
          done();
        });
    });

    it('should fail when unauthorized', (done) => {
      oauthTokenResponse = { access_token: 'AAA', token_type: 'bearer',
        expires_in: 1 };

      request.get('http://localhost::port/protected/resource',
        requestOpts(server.address().port,
          authHeader(`Basic ${encodedCredentials}`)),
        (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(401);
          expect(val.headers['www-authenticate']).to.equal(
            'Bearer realm="cf", error="invalid_token",' +
            ' error_description="jwt malformed"');
          done();
        });
    });

    it('should fail in case of problem with authServer', (done) => {
      oauthTokenResponse = 500;

      request.get('http://localhost::port/protected/resource',
        requestOpts(server.address().port,
          authHeader(`Basic ${encodedCredentials}`)),
        (err, val) => {
          expect(err).to.be.an('error');
          expect(err.statusCode).to.eql(500);
          done();
        });
    });
  });
});
