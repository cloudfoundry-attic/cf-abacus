'use strict';

const jwt = require('jsonwebtoken');
const { extend } = require('underscore');

const systemReadTokenPayload = {
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-meter',
  authorities: [
    'abacus.usage.read'
  ],
  scope: [
    'abacus.usage.read'
  ],
  client_id: 'abacus-usage-meter',
  cid: 'abacus-usage-meter',
  azp: 'abacus-usage-meter',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-meter-plugin',
    'abacus.usage'
  ]
};

const resourceReadTokenPayload = (resourceId) => ({
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus-usage-meter',
  authorities: [
    `abacus.usage.${resourceId}.read`
  ],
  scope: [
    `abacus.usage.${resourceId}.read`
  ],
  client_id: 'abacus-usage-meter',
  cid: 'abacus-usage-meter',
  azp: 'abacus-usage-meter',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-usage-meter',
    'abacus.usage'
  ]
});

describe('Routes', () => {
  const doc = {
    resource_id: 'linux-container'
  };
  const req = {
    params: {
      key: 'key',
      time: 'time'
    }
  };

  let sandbox;
  let retrieverStub;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();

    retrieverStub = {
      retrieve: sandbox.stub()
    };
  });

  afterEach(() => {
    sandbox.reset();
  });

  context('with security', () => {
    before(() => {
      process.env.SECURED = true;
    });

    context('and missing token', () => {
      let route;
      let expectedError;

      beforeEach(async() => {
        retrieverStub.retrieve.resolves(req);
        route = require('./../lib/routes/routes')(retrieverStub);

        expectedError = {
          statusCode: 401,
          header: {
            'WWW-Authenticate': 'Bearer realm="cf", error="invalid_token", error_description="malformed"'
          }
        };
      });

      it('should throw 401', async() => {
        // assertPromise.rejectedWith does NOT do deepEqual on exception with chai 3
        try {
          await route(req);
          throw 'route should throw exception';
        } catch (e) {
          expect(e).to.deep.equal(expectedError);
          // assert.notCalled(retrieverStub.retrieve);
        }
      });
    });

    const authHeader = (payload) => {
      const signedToken = jwt.sign(payload, 'secret', { expiresIn: 43200 });
      return `bearer ${signedToken}`;
    };

    context('and correct scope', () => {
      let route;
      let request;
      let response;

      beforeEach(async() => {
        retrieverStub.retrieve.resolves(req);
        route = require('./../lib/routes/routes')(retrieverStub);
        request = extend({}, req, {
          params: {
            key: 'org/space/app/linux-container/plan/resource_instance_id',
            time: 'time'
          },
          headers: {
            authorization: authHeader(resourceReadTokenPayload('linux-container'))
          }
        });
        response = await route(request);
      });

      it('should respond with expected document', async() => {
        assert.called(retrieverStub.retrieve);
        expect(response).to.deep.equal({
          statusCode: 200,
          body: req
        });
      });
    });

    context('and incorrect scope', () => {
      let route;
      let expectedError;
      let request;

      beforeEach(async() => {
        retrieverStub.retrieve.resolves(req);
        route = require('./../lib/routes/routes')(retrieverStub);
        request = extend({}, req, {
          params: {
            key: 'org/space/app/linux-container/plan/resource_instance_id'
          },
          headers: {
            authorization: authHeader(resourceReadTokenPayload('unknown'))
          }
        });

        expectedError = {
          statusCode: 403,
          header: {
            'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope", ' +
              'error_description="abacus.usage.linux-container.read"'
          }
        };
      });

      it('should throw 403', async() => {
        // assertPromise.rejectedWith does NOT do deepEqual on exception with chai 3
        try {
          await route(request);
          throw 'route should throw exception';
        } catch (e) {
          console.log('>>>>>>>>', e);
          expect(e).to.deep.equal(expectedError);
          assert.notCalled(retrieverStub.retrieve);
        }
      });

    });

    context('and system scope', () => {
      let route;
      let request;
      let response;

      beforeEach(async() => {
        retrieverStub.retrieve.resolves(req);
        route = require('./../lib/routes/routes')(retrieverStub);
        request = extend({}, req, {
          params: {
            key: 'org/space/app/linux-container/plan/resource_instance_id',
            time: 'time'
          },
          headers: {
            authorization: authHeader(systemReadTokenPayload)
          }
        });
        response = await route(request);
      });

      it('should respond with 200', async() => {
        assert.called(retrieverStub.retrieve);
        expect(response).to.deep.equal({
          statusCode: 200,
          body: req
        });
      });
    });

    // NB: following context should be deleted after collector retention period
    context('and old location header format is used', () => {
      let route;
      let request;
      let response;

      context('and resource id is correct', () => {
        beforeEach(async() => {
          retrieverStub.retrieve.resolves(doc);
          route = require('./../lib/routes/routes')(retrieverStub);
          request = extend({}, req, {
            params: {
              key: 'abacus',
              time: 'time'
            },
            headers: {
              authorization: authHeader(resourceReadTokenPayload('linux-container'))
            }
          });
          response = await route(request);
        });

        it('should respond with expected document', async() => {
          assert.called(retrieverStub.retrieve);
          expect(response).to.deep.equal({
            statusCode: 200,
            body: doc
          });
        });
      });

      context('and resource id is not matching', () => {
        const expectedError = {
          statusCode: 403,
          header: {
            'WWW-Authenticate': 'Bearer realm="cf", error="insufficient_scope", ' +
              'error_description="abacus.usage.linux-container.read"'
          }
        };

        beforeEach(async() => {
          retrieverStub.retrieve.resolves(doc);
          route = require('./../lib/routes/routes')(retrieverStub);
          request = extend({}, req, {
            params: {
              key: 'abacus',
              time: 'time'
            },
            headers: {
              authorization: authHeader(resourceReadTokenPayload('object-store'))
            }
          });
        });

        it('should throw 403', async() => {
          // assertPromise.rejectedWith does NOT do deepEqual on exception with chai 3
          try {
            await route(request);
            throw 'route should throw exception';
          } catch (e) {
            expect(e).to.deep.equal(expectedError);
            assert.called(retrieverStub.retrieve);
          }
        });
      });
    });
  });

  context('when unsecured', () => {
    let request;

    before(() => {
      process.env.SECURED = false;
      request = extend({}, req, {
        params: {
          key: 'org/space/app/linux-container/plan/resource_instance_id',
          time: 'time'
        }
      });
    });

    context('when no document is found', () => {
      let response;

      beforeEach(async() => {
        retrieverStub.retrieve.resolves({});
        const route = require('./../lib/routes/routes')(retrieverStub);
        response = await route(request);
      });

      it('should respond with 404', () => {
        assert.called(retrieverStub.retrieve);
        expect(response).to.deep.equal({ statusCode: 404 });
      });
    });

    context('when error reading document', () => {
      let response;

      beforeEach(async() => {
        retrieverStub.retrieve.rejects(new Error('failed to read'));
        const route = require('./../lib/routes/routes')(retrieverStub);

        response = await route(request);
      });

      it('should respond with 500', () => {
        assert.called(retrieverStub.retrieve);
        expect(response).to.deep.equal({
          statusCode: 500,
          body: 'Unable to retrieve document'
        });
      });
    });

    context('when document is found', () => {
      let response;

      beforeEach(async() => {
        retrieverStub.retrieve.resolves(req);
        const route = require('./../lib/routes/routes')(retrieverStub);

        response = await route(request);
      });

      it('should respond with 200', () => {
        assert.called(retrieverStub.retrieve);
        expect(response).to.deep.equal({
          statusCode: 200,
          body: req
        });
      });
    });
  });
});
