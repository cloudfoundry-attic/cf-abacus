'use strict';

const httpStatus = require('http-status-codes');
const abacusRequestModuleStub = stubModule('abacus-request');

describe('healthchecker/app-health-client', () => {
  const appUri = 'http://some.uri.com';
  const credentials = {
    client: 'client',
    secret: 'secret'
  };
  let sandbox;
  let appHealthClient;
  let getStub;
  let createAppHealthClient;

  before(() => {
    sandbox = sinon.createSandbox();
    getStub = sandbox.stub();
    abacusRequestModuleStub.stubProperties({
      get: getStub
    });
    
    createAppHealthClient = require('../lib/app-health-client');
  });

  beforeEach(() => {
    appHealthClient = createAppHealthClient(credentials);
  });

  afterEach(() => {
    sandbox.reset();
  });

  context('when app is healthy', () => {
    let status;

    const base64EncodedCredentials = () => {
      return new Buffer(`${credentials.client}:${credentials.secret}`).toString('base64');
    };

    beforeEach(async() => {
      getStub.yields(undefined, {
        statusCode: httpStatus.OK
      });

      status = await appHealthClient.getApplicationHealth(appUri);
    });
      
    it('should return OK status', () => {
      expect(status).to.equal(httpStatus.OK);
    });

    it('should propagate correct auth header to the request', async() => {
      assert.calledOnce(getStub);
      assert.calledWith(getStub, 
        `${appUri}/healthcheck`,
        {
          headers: {
            Authorization: `Basic ${base64EncodedCredentials()}`
          }
        }
      );
    });
  });

  context('when client error is returned by the app', () => {
    beforeEach(() => {
      getStub.yields(undefined, {
        statusCode: httpStatus.NOT_FOUND
      });
    });

    it('should propagate the error', async() => {
      const status = await appHealthClient.getApplicationHealth(appUri);
      expect(status).to.equal(httpStatus.NOT_FOUND);
    });
  });

  context('when server error is returned by the app', () => {
    beforeEach(() => {
      getStub.yields(undefined, {
        statusCode: httpStatus.BAD_GATEWAY
      });
    });

    it('should propagate the error', async() => {
      const status = await appHealthClient.getApplicationHealth(appUri);
      expect(status).to.equal(httpStatus.BAD_GATEWAY);
    });
  });
 
  context('when unknown error occurs', () => {
    beforeEach(() => {
      getStub.yields(new Error());
    });

    it('should return Internal Server Error', async() => {
      const status = await appHealthClient.getApplicationHealth(appUri);
      expect(status).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });


});
