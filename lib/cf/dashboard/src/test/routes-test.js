'use strict';
/* eslint-disable no-unused-expressions,max-len*/ 
const index = require('./lib/index.js');
const nock = require('nock');
const plan = require('./fixtures/plan.json');
const pricing = require('./fixtures/pricing_plan.json');
const rating = require('./fixtures/rating_plan.json');

describe('lib', () => {
  let app = null;
  let config = null;
  before(() => {
    index.deleteAuthMiddlewareCache();
    index.deleteModules();
    index.mockAuthMiddleware();
    index.mockDbSettings();
    config = require('../config');
    app = require('../application')();
  });

  afterEach(() => {
    index.deleteAuthMiddlewareCache();
    index.deleteModules();
  });

  describe('Routes', () => {
    describe('Abacus Routes', () => {
      describe('GET metering plan success', () => {
        before(() => {
          nock.cleanAll();
          nock(config.uris().provisioning)
            .get('/v1/metering/plans/test-metering-plan')
            .reply(() => {
              return [200, plan];
            });
        });
        after(() => {
          nock.cleanAll();
        });

        it('should call the /metering/plans/test-metering-plan route',
          (done) => {
            chai
              .request(app)
              .get('/v1/metering/plans/test-metering-plan')
              .send({})
              .catch((err) => err.response)
              .then((res) => {
                expect(nock.isDone()).to.be.true;
                expect(res).to.have.status(200);
                done();
              });
          });
      });

      describe('GET metering plan failure', () => {
        before(() => {
          nock(config.uris().provisioning)
            .get('/v1/metering/plans/test-metering-plan')
            .reply(() => {
              return [401, 'Unauthorized', {}];
            });
        });
        after(() => {
          nock.cleanAll();
        });

        it('should call the /metering/plans/test-metering-plan route',
          (done) => {
            chai
              .request(app)
              .get('/v1/metering/plans/test-metering-plan')
              .send({})
              .catch((err) => err.response)
              .then((res) => {
                expect(nock.isDone()).to.be.true;
                expect(res).to.have.status(401);
                done();
              });
          });

      });

      describe('PUT metering plan success', () => {
        before(() => {
          nock(config.uris().provisioning)
            .put('/v1/metering/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
        });
        after(() => {
          nock.cleanAll();
        });
        it('should call /metering/plans/test-metering-plan', (done) => {
          chai.request(app)
            .put('/v1/metering/plans/test-metering-plan')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(201);
              done();
            });
        });
      });

      describe('PUT metering plan failure', () => {
        before(() => {
          nock(config.uris().provisioning)
            .put('/v1/metering/plan/test-metering-plan')
            .reply(() => {
              return [401, {}];
            });
        });
        after(() => {
          nock.cleanAll();
        });
        it('should call /metering/plan/test-metering-plan', (done) => {
          chai.request(app)
            .put('/v1/metering/plans/test-metering-plan')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(401);
              done();
            });
        });
      });

      describe('Update all plans success', () => {
        before(() => {
          nock(config.uris().provisioning)
            .get('/v1/rating/plans/test-metering-plan')
            .reply(() => {
              return [200, rating];
            });
          nock(config.uris().provisioning)
            .get('/v1/pricing/plans/test-metering-plan')
            .reply(() => {
              return [200, pricing];
            });
          nock(config.uris().provisioning)
            .put('/v1/pricing/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
          nock(config.uris().provisioning)
            .put('/v1/rating/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
          nock(config.uris().provisioning)
            .put('/v1/metering/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
        });

        after(() => {
          nock.cleanAll();
        });

        it('should call get/put rating, get/put pricing and put metering', (done) => {
          chai.request(app)
            .put('/v1/plans/test-metering-plan/metrics/test')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(201);
              done();
            });

        });
      });

      describe('update all plans with  get rating failure', () => {
        before(() => {
          nock(config.uris().provisioning)
            .get('/v1/rating/plans/test-metering-plan')
            .reply(() => {
              return [401, {}];
            });
          nock(config.uris().provisioning)
            .get('/v1/pricing/plans/test-metering-plan')
            .reply(() => {
              return [200, pricing];
            });
        });

        after(() => {
          nock.cleanAll();
        });

        it('should fail update metering with error', (done) => {
          chai.request(app)
            .put('/v1/plans/test-metering-plan/metrics/test')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(401);
              done();
            });
        });
      });

      describe('update all plans call with  get pricing failure', () => {
        before(() => {
          nock(config.uris().provisioning)
            .get('/v1/rating/plans/test-metering-plan')
            .reply(() => {
              return [200, rating];
            });
          nock(config.uris().provisioning)
            .get('/v1/pricing/plans/test-metering-plan')
            .reply(() => {
              return [403, {}];
            });
        });

        after(() => {
          nock.cleanAll();
        });

        it('should fail update metering with error', (done) => {
          chai.request(app)
            .put('/v1/plans/test-metering-plan/metrics/test')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(403);
              done();
            });
        });
      });

      describe('update all plans call with update pricing failure', () => {
        before(() => {
          nock(config.uris().provisioning)
            .get('/v1/rating/plans/test-metering-plan')
            .reply(() => {
              return [200, rating];
            });
          nock(config.uris().provisioning)
            .get('/v1/pricing/plans/test-metering-plan')
            .reply(() => {
              return [200, pricing];
            });
          nock(config.uris().provisioning)
            .put('/v1/pricing/plan/test-metering-plan')
            .reply(() => {
              return [400, {}];
            });
          nock(config.uris().provisioning)
            .put('/v1/rating/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
        });

        after(() => {
          nock.cleanAll();
        });

        it('should fail update plans with 400', (done) => {
          chai.request(app)
            .put('/v1/plans/test-metering-plan/metrics/test')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(400);
              done();
            });
        });

      });

      describe('update all plans call with update rating failure', () => {
        before(() => {
          nock(config.uris().provisioning)
            .get('/v1/rating/plans/test-metering-plan')
            .reply(() => {
              return [200, rating];
            });
          nock(config.uris().provisioning)
            .get('/v1/pricing/plans/test-metering-plan')
            .reply(() => {
              return [200, pricing];
            });
          nock(config.uris().provisioning)
            .put('/v1/pricing/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
          nock(config.uris().provisioning)
            .put('/v1/rating/plan/test-metering-plan')
            .reply(() => {
              return [400, {}];
            });
        });

        after(() => {
          nock.cleanAll();
        });

        it('should fail update plans with 400', (done) => {
          chai.request(app)
            .put('/v1/plans/test-metering-plan/metrics/test')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(400);
              done();
            });
        });

      });

      describe('update all plans call with update rating failure', () => {
        before(() => {
          nock(config.uris().provisioning)
            .get('/v1/rating/plans/test-metering-plan')
            .reply(() => {
              return [200, rating];
            });
          nock(config.uris().provisioning)
            .get('/v1/pricing/plans/test-metering-plan')
            .reply(() => {
              return [200, pricing];
            });
          nock(config.uris().provisioning)
            .put('/v1/pricing/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
          nock(config.uris().provisioning)
            .put('/v1/rating/plan/test-metering-plan')
            .reply(() => {
              return [201, {}];
            });
          nock(config.uris().provisioning)
            .put('/v1/metering/plan/test-metering-plan')
            .reply(() => {
              return [400, {}];
            });
        });

        after(() => {
          nock.cleanAll();
        });

        it('should fail update plans with 400', (done) => {
          chai.request(app)
            .put('/v1/plans/test-metering-plan/metrics/test')
            .send({})
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(400);
              done();
            });
        });

      });

      describe('GET usage document success', () => {
        before(() => {
          nock.cleanAll();
          nock(config.uris().provisioning)
            .get('/v1/metering/plans/test-metering-plan')
            .reply(() => {
              return [200, plan];
            });
        });
        after(() => {
          nock.cleanAll();
        });

        it('should successfully generate usage document', (done) => {
          chai
            .request(app)
            .get('/v1/metering/usage_doc/test-metering-plan')
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(Object.keys(res.body)).to.have.lengthOf(9);
              expect(res.body).to.include.keys('start', 'end', 'organization_id');
              // ignore start and end date value
              expect(res.body).to.have.property('organization_id', 'idz:sampleIdentityZoneId');
              expect(res.body).to.have.property('space_id', 'sampleSpaceId');
              expect(res.body).to.have.property('consumer_id', 'sampleConsumerId');
              expect(res.body).to.have.property('resource_id', 'sampleResourceId');
              expect(res.body).to.have.property('plan_id', 'standard');
              expect(res.body).to.have.property('resource_instance_id', 'sampleResourceInstanceId');
              expect(res.body.measured_usage).to.have.lengthOf(4);
              expect(Object.keys(res.body.measured_usage[0])).to.have.lengthOf(2);
              expect(res.body.measured_usage[0]).to.have.keys('measure', 'quantity');
              done();
            });
        });
      });

      describe('GET usage document failure', () => {
        before(() => {
          nock.cleanAll();
          nock(config.uris().provisioning)
            .get('/v1/metering/plans/test-metering-plan')
            .reply(() => {
              return [400, {}];
            });
        });
        after(() => {
          nock.cleanAll();
        });

        it('should fail with generate usage document', (done) => {
          chai
            .request(app)
            .get('/v1/metering/usage_doc/test-metering-plan')
            .catch((err) => err.response)
            .then((res) => {
              expect(nock.isDone()).to.be.true;
              expect(res).to.have.status(400);
              done();
            });
        });
      });

      describe('POST usage document success', () => {
        before(() => {
          nock('http://localhost:9080').post('/').reply('201', {});
        });

        after(() => {
          nock.cleanAll();
        });

        it('should successfully push usage document', (done) => {
          chai.request(app)
            .post('/v1/collector/usage_doc')
            .send({ 'myfield': 'demo' })
            .catch((err) => err.response)
            .then((resp) => {
              expect(nock.isDone()).to.be.true;
              expect(resp).to.have.status(201);
              done();
            });
        });
      });

      describe('POST usage document failure', () => {
        before(() => {
          nock('http://localhost:9080').post('/').reply('400', {});
        });

        after(() => {
          nock.cleanAll();
        });

        it('should fail to push usage document', (done) => {
          chai.request(app)
            .post('/v1/collector/usage_doc')
            .send({ 'myfield': 'demo' })
            .catch((err) => err.response)
            .then((resp) => {
              expect(nock.isDone()).to.be.true;
              expect(resp).to.have.status(400);
              done();
            });
        });
      });

    });
  });

  describe('HTTP Headers', () => {
    before(() => {
      nock.cleanAll();
      nock(config.uris().provisioning)
        .get('/v1/metering/plans/test-metering-plan')
        .reply(() => {
          return [200, plan];
        });
    });
    after(() => {
      nock.cleanAll();
    });

    it('dummy call to test response headers',
      (done) => {
        chai
          .request(app)
          .get('/v1/metering/plans/test-metering-plan')
          .send({})
          .catch((err) => err.response)
          .then((res) => {
            // csp default-src 'self'
            expect(res).to.have.header('x-content-security-policy', /default-src \'self\'/);
            // csp style-src 'self' 'unsafe-inline'
            expect(res).to.have.header('x-content-security-policy', /style-src \'self\' \'unsafe-inline\'/);
            // csp script-src 'self'
            expect(res).to.have.header('x-content-security-policy', /script-src \'self\'/);
            // csp img-src \'self\' data: *
            expect(res).to.have.header('x-content-security-policy', /img-src \'self\' data: */);
            // csp child-src 'self' blob: *
            expect(res).to.have.header('x-content-security-policy', /child-src \'self\' blob: */);

            // cache-control no-cache
            expect(res).to.have.header('cache-control', /no-cache/);

            // x-content-type-options nosniff
            expect(res).to.have.header('x-content-type-options','nosniff');

            // x-frame-options DENY
            expect(res).to.have.header('x-frame-options','DENY');

            // x-dns-prefetch-control  off
            expect(res).to.have.header('x-dns-prefetch-control','off');

            // x-download-options noopen
            expect(res).to.have.header('x-download-options','noopen');

            // x-xss-protection: "1; mode=block"
            expect(res).to.have.header('x-xss-protection', '1; mode=block');
            done();
          });
      });
  });
});
