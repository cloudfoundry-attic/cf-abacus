'use strict';

/* eslint-disable no-unused-expressions */

const oauth = require('abacus-oauth');
const cacheSpy = spy(oauth, 'cache');

describe('Test server initialization', () => {
  let service;

  beforeEach(() => {
    cacheSpy.reset();
    delete require.cache[require.resolve('..')];
    service = require('..');
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
        assert.calledWithExactly(cacheSpy.firstCall, sinon.match.any,
          process.env.CF_CLIENT_ID, process.env.CF_CLIENT_SECRET);
      });

      it('service usage token should be requested', () => {
        assert.calledWithExactly(cacheSpy.secondCall, sinon.match.any,
          process.env.CLIENT_ID, process.env.CLIENT_SECRET,
        'abacus.usage.services.write abacus.usage.services.read');
      });
    });

    context('when not secured', () => {
      before(() => {
        process.env.SECURED = 'false';
      });

      it('admin token should still be requested', () => {
        assert.calledWithExactly(cacheSpy.firstCall, sinon.match.any,
          process.env.CF_CLIENT_ID, process.env.CF_CLIENT_SECRET);
      });

      it('service usage token shound not be requested', () => {
        expect(cacheSpy.callCount).to.equal(1);
      });
    });
  });
});
