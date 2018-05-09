'use strict';

const HttpStatus = require('http-status-codes');

const Collector = require('../lib/collector');

describe('test collector', () => {

  const usage = {
    start: 1420243200000,
    end: 1420245000000,
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'test-resource',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 12
      }
    ]
  };

  context('when posting usage', () => {

    let validatorStub;
    let sendStub;
    let collector;

    beforeEach(() => {
      validatorStub = sinon.stub();
      sendStub = sinon.stub();
      collector = new Collector({ validate: validatorStub }, { send: sendStub });
    });

    it('should succeed', async() => {
      const response = await collector.collect(usage);
      expect(response.status).to.equal(HttpStatus.CREATED);
      expect(response.header.Location).to.equal('https://metering');
    });

    it('should fail when validate throws', async() => {
      validatorStub.throws();
      const response = await collector.collect(usage);
      expect(response.status).to.equal(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should fail when validate throws BAD_REQUEST', async() => {
      validatorStub.throws({ badRequest: true }) ;
      const response = await collector.collect(usage);
      expect(response.status).to.equal(HttpStatus.BAD_REQUEST);
    });

    it('should fail when send throws', async() => {
      sendStub.throws();
      const response = await collector.collect(usage);
      expect(response.status).to.equal(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

});
