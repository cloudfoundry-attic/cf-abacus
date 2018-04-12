'use strict';

const _ = require('underscore');
const extend = _.extend;

const httpStatus = require('http-status-codes');

describe('Bind service instance', () => {
  let bindService;
  let uaaCreationResult = {
    statusCode: '',
    body: ''
  };

  const request = {
    params: {
      instance_id: 'instanceId',
      binding_id: 'bindingId'
    }
  };

  const sendSpy = spy((result) => {});

  const responseSpy = {
    status: () => {
      return {
        send: sendSpy
      };
    }
  };

  beforeEach(() => {
    delete require.cache[require.resolve('../auth/uaa.js')];

    const createClientSpy = spy((clientId, resourceId, cb) => {
      cb(uaaCreationResult.statusCode, uaaCreationResult.body);
    });

    const uaa = require('../auth/uaa.js');
    const uaaMock = extend({}, uaa, {
      createClient: createClientSpy
    });

    require.cache[require.resolve('../auth/uaa.js')].exports = uaaMock;
    bindService = require('../routes/bind-service.js');
    sendSpy.reset();
  });

  it('should bind service when UAA client is created', () => {
    uaaCreationResult.statusCode = httpStatus.OK;
    uaaCreationResult.body = { credentials: {} };

    bindService(request, responseSpy);

    expect(sendSpy.callCount).to.equal(1);
    expect(sendSpy.getCalls()[0].args[0].credentials).to.deep.equal({
      resource_id: 'instanceId',
      plans: ['instanceId-instanceId']
    });
  });

  it('should fail when UAA respond with INTERNAL_SERVER_ERROR', () => {
    uaaCreationResult.statusCode = httpStatus.INTERNAL_SERVER_ERROR;
    uaaCreationResult.body = { };

    bindService(request, responseSpy);

    expect(sendSpy.callCount).to.equal(1);
    expect(sendSpy.getCalls()[0].args[0].credentials)
      .to.equal(undefined);
  });
});
