'user strict';

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
  iat: 1456147679,
  exp: 1456190879,
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
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus-usage-meter',
    'abacus.usage'
  ]
});

describe('Routes', () => {

  const req = {
    params: {
      key: 'key',
      time: 'time'
    }
  };

  let sandbox;
  let retrieverStub;
  let sendStub;
  let res;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();

    retrieverStub = {
      retrieve: sandbox.stub()
    };

    sendStub = sandbox.stub();
    res = {
      status: sandbox.stub().callsFake(() => ({
        send: sendStub
      }))
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
          await route(req, res);
          throw 'route should throw exception';
        } catch (e) {
          expect(e).to.deep.equal(expectedError);
          assert.notCalled(retrieverStub.retrieve);
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
        await route(request, res);
      });

      it('should respond with 200', async() => {
        assert.calledWith(res.status, 200);
        assert.called(retrieverStub.retrieve);
        assert.calledWith(sendStub, req);
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
          await route(request, res);
          throw 'route should throw exception';
        } catch (e) {
          expect(e).to.deep.equal(expectedError);
          assert.notCalled(retrieverStub.retrieve);
        }
      });

    });

    context('and system scope', () => {
      let route;
      let request;

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
        await route(request, res);
      });

      it('should respond with 200', async() => {
        assert.calledWith(res.status, 200);
        assert.called(retrieverStub.retrieve);
        assert.calledWith(sendStub, req);
      });
    });
  });

  context('when unsecured', () => {
    before(() => {
      process.env.SECURED = false;
    });

    context('when no document is found', () => {
      beforeEach(async() => {
        retrieverStub.retrieve.resolves({});
        const route = require('./../lib/routes/routes')(retrieverStub);
        await route(req, res);
      });

      it('should respond with 404', () => {
        assert.calledWith(res.status, 404);
        assert.called(retrieverStub.retrieve);
      });
    });

    context('when error reading document', () => {
      beforeEach(async() => {
        retrieverStub.retrieve.rejects(new Error('failed to read'));
        const route = require('./../lib/routes/routes')(retrieverStub);

        await route(req, res);
      });

      it('should respond with 500', () => {
        assert.calledWith(res.status, 500);
        assert.calledWith(sendStub, 'Unable to retrieve document');
        assert.called(retrieverStub.retrieve);
      });
    });

    context('when document is found', () => {
      beforeEach(async() => {
        retrieverStub.retrieve.resolves(req);
        const route = require('./../lib/routes/routes')(retrieverStub);

        await route(req, res);
      });

      it('should respond with 200', () => {
        assert.calledWith(res.status, 200);
        assert.called(retrieverStub.retrieve);
        assert.calledWith(sendStub, req);
      });
    });
  });
});
