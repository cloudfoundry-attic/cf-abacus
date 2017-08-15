'use strict';

/* eslint-disable no-unused-expressions */

const oauth = require('abacus-oauth');
const cluster = require('abacus-cluster');
const request = require('abacus-request');

const cacheStub = sinon.stub(oauth, 'cache', () => {
  const f = () => 'Bearer abc';
  f.start = () => {};

  return f;
});


describe('Test server initialization', () => {
  let service;
  const sandbox = sinon.sandbox.create();

  const startReporting = () => {
    delete require.cache[require.resolve('..')];
    service = require('..');
    service();
  };
  
  afterEach(()=> {
    sandbox.restore();
  });

  beforeEach(() => {
    cacheStub.reset();
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
    beforeEach(() => {
      process.env.MIN_INTERVAL_TIME = 1;
      process.env.SERVICES = `{
      "mongodb": {
          "plans": ["small", "medium"]
      },
      "redis": {
        "plans": ["small"]
      }
      }`;

      require('abacus-dbclient');
      sandbox.stub(require.cache[require.resolve('abacus-dbclient')], 'exports')
        .callsFake(() => ({ get: (doc, cb) => cb(undefined, {
          lastRecordedGUID: 1, 
          lastRecordedTimestamp: 123
        }) 
        }));

      sandbox.stub(cluster, 'isWorker').returns(true);
    });

    it('should read service guids from CC', (done) => {
      const mongoGuid = 'abc123';
      const redisGuid = 'def456';
      const servicesResponseBody = {
        'total_results': 2,
        'total_pages': 1,
        'prev_url': null,
        'next_url': null,
        'resources': [
          {
            'metadata': {
              'guid': mongoGuid
            },
            'entity': {
              'label': 'mongodb'
            }
          },
          {
            'metadata': {
              'guid': redisGuid
            },
            'entity': {
              'label': 'redis'
            }
          }
        ]
      };

      const getStub = sandbox.stub(request, 'get');
      getStub.onFirstCall()
        .yields(undefined, { statusCode: 200, body: servicesResponseBody });

      getStub.onSecondCall().callsFake((uri, opts, cb) => {
        assert.calledWith(getStub.firstCall, sinon.match.any,
          sinon.match({ page: '/v2/services?=label IN mongodb,redis' }));
        expect(opts.page).to.include(`IN ${mongoGuid},${redisGuid}`);
        done();
      });

      startReporting();
    });

    it('should fail when there is an error in CC', (done) => {
      const getStub = sandbox.stub(request, 'get');
      getStub.onFirstCall().yields('some_error');
      getStub.onSecondCall().callsFake(() => {
        // dummy expectation since we're in the second call
        expect(getStub.callCount).to.equal(2);
        done();
      });

      startReporting();
    });
  });

});


