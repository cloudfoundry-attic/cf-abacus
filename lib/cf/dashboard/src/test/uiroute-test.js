'use strict';
const index = require('./lib/index.js');
const nock = require('nock');
const config = require('../config');
const serviceBindings = require('./fixtures/service_bindings.json'); 

describe('UI Routes', () => {
  let app = null;
  before(() => {
    index.deleteAuthMiddlewareCache();
    index.mockAuthMiddleware();
    index.mockDbSettings();
    app = require('../application')();
  });

  after(() => {
    index.deleteModules();
    index.deleteAuthMiddlewareCache();
  });

  describe('UI Routes success', () => {
    before(() => {
      nock.cleanAll();
      nock(config.uris().api)
        .get('/v2/service_instances/test-instance/permissions')
        .reply(() => {
          return [200, { manage: true }];
        });
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
    });

    it('should call the /manage/instances/test-instance route',
      (done) => {
        chai
          .request(app)
          .get('/manage/instances/test-instance')
          .send({})
          .catch((err) => err.response)
          .then((res) => {
            chai.assert(res.type, 'html');
            expect(nock.isDone, true);
            done();
          });
      });
  });

  describe('UI Routes permission failure', () => {
    before(() => {
      nock.cleanAll();
      nock(config.uris().api)
        .get('/v2/service_instances/test-instance/permissions')
        .reply(() => {
          return [200, { manage: false }];
        });
      nock(config.uris().api)
        .get('/v2/service_instances/test-instance/service_bindings')
        .reply(() => {
          return [200, serviceBindings];
        });
    });

    after(() => {
      nock.cleanAll();
    });

    it('should call the /manage/instances/test-instance route',
      (done) => {
        chai
          .request(app)
          .get('/manage/instances/test-instance')
          .send({})
          .catch((err) => err.response)
          .then((res) => {
            chai.assert(res.type, 'html');
            expect(nock.isDone, true);
            done();
          });
      });
  });

  describe('UI Routes no bindings', () => {
    before(() => {
      nock(config.uris().api)
        .get('/v2/service_instances/test-instance/permissions')
        .reply(() => {
          return [200, { manage: true }];
        });
      nock(config.uris().api)
        .get('/v2/service_instances/test-instance/service_bindings')
        .reply(() => {
          return [200, { 'resources': [] }];
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
    });

    it('should call the /manage/instances/test-instance route',
      (done) => {
        chai
          .request(app)
          .get('/manage/instances/test-instance')
          .send({})
          .catch((err) => err.response)
          .then((res) => {
            chai.assert(res.type, 'html');
            expect(nock.isDone, true);
            done();
          });
      });
  });
});
