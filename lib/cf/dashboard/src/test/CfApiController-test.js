'use strict';
/* eslint-disable max-len*/
require('./lib/index.js');
const controller = require('../controllers').cfApi;
const config = require('../config');
const serviceBindings = require('./fixtures/service_bindings.json');
const Promise = require('bluebird');
const req = {
  'params': {
    'instance_id': 'test-instance'
  },
  'session': {
    'uaa_response': {
      'access_token': 'abcd1234'
    }
  },
  'sessionStore': {
    'refreshToken': 'abcd'
  },
  'query': {
    'quota_def_url': '/test',
    'key': 'test'
  }
};
let controllerSpy;
describe('lib', () => {
  describe('controllers', () => {
    describe('cfApiController', () => {

      describe('test user permission call', () => {
        beforeEach(() => {
          controllerSpy = sinon.spy(controller, 'checkUserPermissionAndProceed');
        });
        afterEach(() => {
          controllerSpy.restore();
          nock.cleanAll();
        });

        it('calls cloud controller to check user permissions and succeed', (done) => {
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/service_keys')
            .reply(() => {
              return [200, serviceBindings];
            });
          nock(config.cf.token_url)
            .post('').reply(() => {
              return [200, {
                'access_token': 'accessToken'
              }];
            });
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/permissions')
            .reply(() => {
              return [200, { manage: true }];
            });
          Promise.try(() => {
            return controller.checkUserPermissionAndProceed(req);
          }).then(() => {
            expect(nock.isDone, true);
            expect(controllerSpy.calledOnce).to.equal(true);
            expect(controllerSpy.threw()).to.equal(false);
            done();
          });
        });

        it('calls cloud controller to check user permissions and returns false', (done) => {
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/permissions')
            .reply(() => {
              return [200, { manage: false }];
            });
          Promise.try(() => {
            return controller.checkUserPermissionAndProceed(req);
          }).catch((e) => {
            chai.assert(e.message, 'Missing required permissions for managing this Instance');
            done();
          });
        });
      });

      describe('test user permission call return 400', () => {
        before(() => {
          nock.cleanAll();
          controllerSpy = sinon.spy(controller, 'checkUserPermissionAndProceed');
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/permissions')
            .reply(400);
        });

        after(() => {
          nock.cleanAll();
          controllerSpy.restore();
        });

        it('calls cloud controller to check user permissions and returns 400', (done) => {
          Promise.try(() => {
            return controller.checkUserPermissionAndProceed(req);
          }).catch((e) => {
            chai.assert(e.status, 400);
            done();
          });
        });
      });

      describe('getServiceCredentials()', () => {
        before(() => {
          let emptyServiceKeysRes = {
            'total_results' : 0
          };
          nock.cleanAll();
          controllerSpy = sinon.spy(controller, 'getServiceCredentials');
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/service_keys')
            .reply(200,emptyServiceKeysRes);

          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/service_bindings')
            .reply(() => {
              return [200, serviceBindings];
            });
          nock(config.cf.token_url)
            .post('').reply(() => {
              return [200, {
                'access_token': 'accessToken'
              }];
            });
        });

        after(() => {
          nock.cleanAll();
          controllerSpy.restore();
        });

        it('calls get service keys but gets empty response', (done) => {
          Promise.try(() => {
            return controller.getServiceCredentials(req);
          }).then((res) => {
            expect(nock.isDone, true);
            expect(controllerSpy.calledOnce).to.equal(true);
            done();
          });
        });
      });

      describe('test service bindings with failure', () => {
        let serviceBindingSpy;
        beforeEach(() => {
          serviceBindingSpy = sinon.spy(controller, 'getServiceBinding');
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/service_bindings')
            .reply(() => {
              return [200, serviceBindings];
            });
          nock(config.cf.token_url)
            .post('/').reply(() => {
              return [400, {
              }];
            });
        });

        afterEach(() => {
          serviceBindingSpy.restore();
          nock.cleanAll();
        });

        it('should fail with 500 error', (done) => {
          Promise.try(() => {
            return controller.getServiceBinding(req);
          }).catch((e) => {
            expect(nock.isDone,true);
            expect(e).to.have.status(500);
            done();
          });
        });
      });

      describe('test service bindings call', () => {
        beforeEach(() => {
          nock.cleanAll();
          controllerSpy = sinon.spy(controller, 'getServiceBinding');
        });
        afterEach(() => {
          controllerSpy.restore();
          controllerSpy.restore();
          nock.cleanAll();
        });

        it('should test service binding with empty resources and throw 404', (done) => {
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/service_bindings')
            .reply(200, { resources: [] });
          Promise.try(() => {
            return controller.getServiceBinding(req);
          }).catch((e) => {
            chai.assert.equal(e.message, 'Unable to find service keys or service bindings for this Instance. Either bind to an application or create a service key.');
            expect(e).to.have.status(404);
            done();
          });
        });

        it('calls cloud controller service bindings and get 401', (done) => {
          nock(config.uris().api)
            .get('/v2/service_instances/test-instance/service_bindings')
            .reply(401);
          Promise.try(() => {
            return controller.getServiceBinding(req);
          }).catch((e) => {
            expect(e).to.have.status(401);
            done();
          });
        });
      });

      describe('test getInfo call', () => {
        beforeEach(() => {
          controllerSpy = sinon.spy(controller, 'getInfo');
          nock(config.uris().api)
            .get('/v2/info')
            .reply(() => {
              return [200, {}];
            });
        });

        afterEach(() => {
          nock.cleanAll();
        });

        it('should getinfo call', (done) => {
          Promise.try(() => {
            return controller.getInfo();
          }).then((res) => {
            expect(nock.isDone, true);
            expect(controllerSpy.calledOnce).to.equal(true);
            done();
          });
        });
      });
    });
  });
});
