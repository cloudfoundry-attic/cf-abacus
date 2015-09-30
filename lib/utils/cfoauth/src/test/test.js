'use strict';

const _ = require('underscore');
const jwt = require('jsonwebtoken');
const request = require('abacus-request');
const express = require('abacus-express');

const extend = _.extend;

const debug = require('abacus-debug')('abacus-oauth');

// Mock the request module
const reqmock = extend({}, request, {
  post: spy((uri, req, cb) => cb())
});
require.cache[require.resolve('abacus-request')].exports = reqmock;

process.env.API_HOST_NAME = 'localhost:25000';
process.env.TOKEN_ENDPOINT = 'localhost:35000';
process.env.CLIENT_ID = 'clientid';
process.env.CLIENT_SECRET = 'password';

const tokenSecret = '2DCQ@#R!Cyhj7nbs4t4fWbb34b';
const invalidTokenSecret = '3r3eF2D#v#tbrgTTbTg3rgbgf';
const tokenAlgorithm = 'HS256'

process.env.TOKEN_SECRET = tokenSecret;
process.env.TOKEN_ALGORITHM = tokenAlgorithm;

const invalidSignatureError = {
  name: 'JsonWebTokenError',
  message: 'invalid signature'
};
const invalidAlgorithmError = {
  name: 'JsonWebTokenError',
  message: 'invalid algorithm'
};

const apiport = 25000;
const tokenport = 35000;

const info = {
  name: 'CF-instance', build: '210010', version: 2,
  authorization_endpoint: 'https://localhost:40000/UAALoginServerWAR',
  token_endpoint: 'https://uaa.cf.org'
};

const token = {
  access_token: 'AAAAAAAAAA',
  token_type: 'bearer',
  expires_in: 43199,
  scope: 'scim.read cloud_controller.read',
  jti: '2570a1c1-103f-4aae-85f1-35b9564343a5'
};

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

const decodedUserToken = {
  header: {
    alg: tokenAlgorithm
  },
  payload: {
    jti: '55555555-6666-7777-8888-999999999999',
    sub: '11111111-2222-3333-4444-000000000000',
    scope: [
      'password.write',
      'openid',
      'cloud_controller.write',
      'cloud_controller.read'
    ],
    client_id: 'cf',
    cid: 'cf',
    azp: 'cf',
    grant_type: 'password',
    user_id: '11111111-2222-3333-4444-000000000000',
    user_name: 'user@cf.org',
    email: 'user@cf.org',
    iat: 1440462540,
    exp: 1440505740,
    iss: 'http://uaa.cf.com/oauth/token',
    aud: [
      'openid',
      'cloud_controller',
      'password',
      'cf'
    ]
  },
  signature: 'WD1dxkXslvFL8TF87NezUEtZ7EYk7kAHZ0LlXfwvdAs'
};

const oauth = require('..');

describe('Token endpoint', () => {
  let server;

  const createServer = function(apiport) {
    const app = express();

    app.get('/v2/info', function(req, res) {
      debug('request for info');
      res.status(200).send(info);
    });
    app.get('/e1/v2/info', function(req, res) {
      debug('error');
      res.status(400).send({
        error: 'Info not available'
      });
    });
    app.get('/e2/v2/info', function(req, res) {
      debug('error');
      res.status(400).send();
    });

    return app.listen(apiport);
  };

  beforeEach(function() {
    server = createServer(apiport);
  });

  afterEach(function() {
    server.close();
  });

  describe('Get token endpoint', () => {
    it('Endpoint from argument', (done) => {
      oauth.tokenEndpoint('localhost:25000', (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.equal('uaa.cf.org');
        done();
      });
    });

    it('Endpoint from env property', (done) => {
      oauth.tokenEndpoint(null, (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.equal('uaa.cf.org');
        done();
      });
    });

    it('Endpoint from argument - connection error', (done) => {
      oauth.tokenEndpoint('localhost:25001', (err, val) => {
        expect(err).to.not.equal(null);
        expect(val).to.equal(undefined);
        done();
      });
    });

    it('Endpoint from argument - 400 error', (done) => {
      oauth.tokenEndpoint('localhost:25000/e1', (err, val) => {
        expect(err).to.not.equal(null);
        expect(val).to.equal(undefined);
        done();
      });
    });

    it('Endpoint from argument - 400 error, no body', (done) => {
      oauth.tokenEndpoint('localhost:25000/e2', (err, val) => {
        expect(err).to.not.equal(null);
        expect(val).to.equal(undefined);
        done();
      });
    });
  });
});

describe('Token', () => {
  let server;

  const createServer = function(tokenport) {
    const app = express();

    app.get('/oauth/token',
      function(req, res) {
        debug('token request');
        res.status(200).send(token);
      });
    app.get('/e1/oauth/token',
      function(req, res) {
        debug('error');
        res.status(400).send({
          error: 'Info not available'
        });
      });
    app.get('/e2/oauth/token',
      function(req, res) {
        debug('error');
        res.status(400).send();
      });

    return app.listen(tokenport);
  };

  beforeEach(function() {
    server = createServer(tokenport);
  });

  afterEach(function() {
    server.close();
  });

  describe('Get token', () => {
    it('Token from argument', (done) => {
      oauth.newToken('localhost:35000', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.equal(null);
          // add the additional field (with actual time)
          token.expiry = val.expiry;
          expect(val).to.deep.equal(token);
          done();
        });
    });

    it('Token from argument - error', (done) => {
      oauth.newToken('localhost:35001', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.not.equal(null);
          expect(val).to.equal(undefined);
          done();
        });
    });

    it('Token from argument - 400', (done) => {
      oauth.newToken('localhost:35000/e1', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.not.equal(null);
          expect(val).to.equal(undefined);
          done();
        });
    });

    it('Token from argument - 400 - no body', (done) => {
      oauth.newToken('localhost:35000/e1', 'clientid', 'password', null,
        (err, val) => {
          expect(err).to.not.equal(null);
          expect(val).to.equal(undefined);
          done();
        });
    });

    it('Token from env property', (done) => {
      oauth.newToken(null, null, null, null,
        (err, val) => {
          expect(err).to.equal(null);
          // add the additional field (with actual time)
          token.expiry = val.expiry;
          expect(val).to.deep.equal(token);
          done();
        });
    });

    it('Token from env property with scopes', (done) => {
      oauth.newToken(null, null, null, 'scim.read cloud_controller.read',
        (err, val) => {
          expect(err).to.equal(null);
          // add the additional field (with actual time)
          token.expiry = val.expiry;
          expect(val).to.deep.equal(token);
          done();
        });
    });

  });
});

describe('Decode token', () => {
  it('Decode', (done) => {
    const val = oauth.decode(encodedToken);
    expect(val).to.deep.equal(decodedToken);
    done();
  });

  it('Decode user token', (done) => {
    const val = oauth.decode(encodedUserToken);
    expect(val).to.deep.equal(decodedUserToken);
    done();
  });
});

describe('Validate token', () => {
  it('Valid token - arguments', (done) => {
    // Sign known token using default algorithm (HS256)
    const signed = jwt.sign(decodedToken.payload, tokenSecret, {
      expiresInMinutes: 720
    });

    // Test the validation
    oauth.validate(signed, tokenSecret, tokenAlgorithm,
      (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.deep.equal(decodedToken.payload);
        done();
      });
  });

  it('Valid token - env property', (done) => {
    // Sign known token using default algorithm (HS256)
    const signed = jwt.sign(decodedToken.payload, tokenSecret, {
      expiresInMinutes: 720
    });

    // Test the validation
    oauth.validate(signed, null, null,
      (err, val) => {
        expect(err).to.equal(null);
        expect(val).to.deep.equal(decodedToken.payload);
        done();
      });
  });

  it('Invalid signature', (done) => {
    // Sign known token using default algorithm (HS256) and invalid secret
    const signed = jwt.sign(decodedToken.payload, invalidTokenSecret, {
      expiresInMinutes: 720
    });

    // Test the validation
    oauth.validate(signed, tokenSecret, tokenAlgorithm,
      (err, val) => {
        expect(err.name).to.equal(invalidSignatureError.name);
        expect(err.message).to.equal(invalidSignatureError.message);
        expect(val).to.deep.equal(undefined);
        done();
      });
  });

  it('Signing algorithm not specified', (done) => {
    // Sign known token using default algorithm (HS256) and invalid secret
    const signed = jwt.sign(decodedToken.payload, invalidTokenSecret, {
      expiresInMinutes: 720
    });

    // Test the validation
    process.env.TOKEN_ALGORITHM = null;
    oauth.validate(signed, tokenSecret, null,
      (err, val) => {
        expect(err.name).to.equal(invalidAlgorithmError.name);
        expect(err.message).to.equal(invalidAlgorithmError.message);
        expect(val).to.deep.equal(undefined);
        done();
      });
  });
});

describe('Get user info', () => {
  it('Get user info, valid grant type', (done) => {
    const val = oauth.getUserInfo(encodedUserToken);
    expect(val).to.deep.equal({
      user_id: '11111111-2222-3333-4444-000000000000',
      user_name: 'user@cf.org'
    });
    done();
  });

  it('Get user info, invalid grant type', (done) => {
    const val = oauth.getUserInfo(encodedToken);
    expect(val).to.deep.equal(new Error('Incorrect token type'));
    done();
  });
});

describe('Get scope', () => {
  it('Get scope - password credential', (done) => {
    const val = oauth.getScope(encodedUserToken);
    expect(val).to.deep.equal([
      'password.write',
      'openid',
      'cloud_controller.write',
      'cloud_controller.read'
    ]);
    done();
  });

  it('get scope - client id credential', (done) => {
    const val = oauth.getScope(encodedToken);
    expect(val).to.deep.equal([
      'scim.read',
      'uaa.resource',
      'openid',
      'cloud_controller.read'
    ]);
    done();
  });
});

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
      expiresInMinutes: 720
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
});
