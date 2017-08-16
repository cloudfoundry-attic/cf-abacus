'use strict';

/* eslint-disable no-unused-expressions */

const cluster = require('abacus-cluster');
const request = require('abacus-request');

describe('Test server initialization', () => {
  let service;
  let cacheStub;
  const sandbox = sinon.sandbox.create();

  const reloadAbacusOauth = () => {
    delete require.cache[require.resolve('abacus-oauth')];
    const oauth = require('abacus-oauth');
    cacheStub = sinon.stub(oauth, 'cache').callsFake(() => {
      const f = () => 'Bearer abc';
      f.start = () => {};

      return f;
    });
  };

  const startReporting = () => {
    delete require.cache[require.resolve('..')];
    reloadAbacusOauth();
    service = require('..');
    service();
  };

  afterEach(()=> {
    sandbox.restore();
  });

  beforeEach(() => {
    startReporting();
  });

  context('of configurations', () => {
    context('when environment variables are not set', () => {
      it('should use the defaults', () => {
        expect(service.reportingConfig.minInterval).to.equal(5000);
        expect(service.reportingConfig.maxInterval).to.equal(240000);
        expect(service.reportingConfig.guidMinAge).to.equal(60000);
      });
    });

    context('when environment variables are set', () => {
      const maxIntervalTime = 480000;
      const minIntervalTime = 2000;
      const minAge = 120000;

      before(() => {
        process.env.MIN_INTERVAL_TIME = minIntervalTime;
        process.env.MAX_INTERVAL_TIME = maxIntervalTime;
        process.env.GUID_MIN_AGE = minAge;
        process.env.ORGS_TO_REPORT = '["a", "b", "c"]';
      });

      after(() => {
        delete process.env.MIN_INTERVAL_TIME;
        delete process.env.MAX_INTERVAL_TIME;
        delete process.env.GUID_MIN_AGE;
        delete process.env.ORGS_TO_REPORT;
      });

      it('should use the values', () => {
        expect(service.reportingConfig.minInterval).to.equal(minIntervalTime);
        expect(service.reportingConfig.maxInterval).to.equal(maxIntervalTime);
        expect(service.reportingConfig.guidMinAge).to.equal(minAge);
        expect(service.reportingConfig.orgsToReport).to.deep.equal(
          ['a', 'b', 'c']);
      });
    });
  });

  context('of OAuth tokens', () => {
    before(() => {
      process.env.CF_CLIENT_ID = 'cf-client';
      process.env.CF_CLIENT_SECRET = 'cf-secret';
    });

    context('when secured', () => {

      before(() => {
        process.env.SECURED = 'true';
        process.env.CLIENT_ID = 'client';
        process.env.CLIENT_SECRET = 'secret';

      });

      it('admin token should be requested', () => {
        assert.calledWithExactly(cacheStub.firstCall, sinon.match.any,
          process.env.CF_CLIENT_ID, process.env.CF_CLIENT_SECRET);
      });

      it('service usage token should be requested', () => {
        assert.calledWithExactly(cacheStub.secondCall, sinon.match.any,
          process.env.CLIENT_ID, process.env.CLIENT_SECRET,
        'abacus.usage.services.write abacus.usage.services.read');
      });
    });

    context('when not secured', () => {
      before(() => {
        process.env.SECURED = 'false';
      });

      it('admin token should still be requested', () => {
        assert.calledWithExactly(cacheStub.firstCall, sinon.match.any,
          process.env.CF_CLIENT_ID, process.env.CF_CLIENT_SECRET);
      });

      it('service usage token shound not be requested', () => {
        expect(cacheStub.callCount).to.equal(1);
      });
    });
  });

  context('when service plans and labels are provided', () => {
    const serviceGuid1 = 'abc123';
    const serviceGuid2 = 'def456';

    beforeEach(() => {
      process.env.MIN_INTERVAL_TIME = 1;

      require('abacus-dbclient');
      sandbox.stub(require.cache[require.resolve('abacus-dbclient')], 'exports')
        .callsFake(() => ({ get: (doc, cb) => cb(undefined, {
          lastRecordedGUID: 1,
          lastRecordedTimestamp: 123
        })
        }));

      sandbox.stub(cluster, 'isWorker').returns(true);
    });

    context('when loading service guids from CC', () => {
      beforeEach(() => {
        process.env.SERVICES = `{
        "service1": {
            "plans": ["small", "medium"]
        },
        "service2": {
          "plans": ["small"]
        }
        }`;
      });

      it('should read service usage events based on them', (done) => {
        const servicesResponseBody = {
          'resources': [
            {
              'metadata': {
                'guid': serviceGuid1
              },
              'entity': {
                'label': 'service1'
              }
            },
            {
              'metadata': {
                'guid': serviceGuid2
              },
              'entity': {
                'label': 'service2'
              }
            }
          ]
        };

        const getStub = sandbox.stub(request, 'get');

        getStub.onFirstCall()
          .yields(undefined, { statusCode: 200, body: servicesResponseBody });

        getStub.onSecondCall().callsFake((uri, opts, cb) => {
          assert.calledWith(getStub.firstCall, sinon.match.any,
            sinon.match({ page: '/v2/services?=label IN service1,service2' }));
          expect(opts.page)
            .to.include(`service_guid IN ${serviceGuid1},${serviceGuid2}`);
          done();
        });

        startReporting();
      }).timeout(5000);

      it('should retry when none are found', (done) => {

        const getStub = sandbox.stub(request, 'get');

        getStub.onFirstCall()
          .yields(undefined, { statusCode: 200, body: {
            'resources': []
          } });

        getStub.onSecondCall().callsFake((uri, opts, cb) => {
          assert.calledWith(getStub.secondCall, sinon.match.any,
            sinon.match({ page: '/v2/services?=label IN service1,service2' }));
          done();
        });

        startReporting();

      }).timeout(5000);

      it('should retry when there is an error from CC', (done) => {
        const getStub = sandbox.stub(request, 'get');

        getStub.onFirstCall().yields('some_error');

        getStub.onSecondCall().callsFake((uri, opts, cb) => {
          assert.calledWith(getStub.secondCall, sinon.match.any,
            sinon.match({ page: '/v2/services?=label IN service1,service2' }));
          done();
        });

        startReporting();
      }).timeout(5000);

    });

    it('should read usage events when all guids are configured',
      (done) => {
        process.env.SERVICES = `{
            "service1": {
                "guid": "${serviceGuid1}",
                "plans": ["small", "medium"]
            }
            }`;

        const getStub = sandbox.stub(request, 'get');

        getStub.callsFake((uri, opts, cb) => {
          expect(opts.page).to.include(`service_guid IN ${serviceGuid1}`);
          done();
        });

        startReporting();
      }).timeout(5000);

    it('should read only missing service guids',
      (done) => {
        process.env.SERVICES = `{
            "service1": {
                "guid": "${serviceGuid1}",
                "plans": ["small", "medium"]
            },
            "service2": {
                "plans": ["small"]
            }
            }`;

        const servicesResponseBody = {
          'resources': [
            {
              'metadata': {
                'guid': serviceGuid2
              },
              'entity': {
                'label': 'service2'
              }
            }
          ]
        };

        const getStub = sandbox.stub(request, 'get');

        getStub.onFirstCall()
          .yields(undefined, { statusCode: 200, body: servicesResponseBody });

        getStub.onSecondCall().callsFake((uri, opts, cb) => {
          assert.calledWith(getStub.firstCall, sinon.match.any,
            sinon.match({ page: '/v2/services?=label IN service2' }));
          expect(opts.page)
            .to.include(`service_guid IN ${serviceGuid1},${serviceGuid2}`);
          done();
        });

        startReporting();
      }).timeout(5000);
  });

});


