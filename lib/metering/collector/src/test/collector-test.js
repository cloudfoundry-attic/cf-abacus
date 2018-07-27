'use strict';

const httpStatus = require('http-status-codes');

const { createCollector } = require('../lib/collector');

describe('test collector', () => {

  const baseUrl = 'http://abacus.cloud.com';
  const processedId = 'processedId';

  const usage = {
    start: 1420243200000,
    end: 1420245000000,
    processed_id: processedId,
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
      collector = createCollector({ validate: validatorStub }, { send: sendStub });
    });

    it('succeeds', async() => {
      const response = await collector.collect(usage);
      expect(response.status).to.equal(httpStatus.ACCEPTED);
    });

    it('returns valid Location header', async() => {
      const response = await collector.collect(usage, undefined, baseUrl);
      expect(response.header.Location).to.equal(
        `${baseUrl}/v1/metering/collected/usage/t/000${usage.end}/` +
        'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/aaeae239-f3f8-483c-9dd0-de5d41c38b6a/' +
        'external:bbeae239-f3f8-483c-9dd0-de6781c38bab/test-resource/basic/0b39fa70-a65f-4183-bae8-385633ca5c87'
      );
    });

    it('fails when validate throws', async() => {
      validatorStub.throws('Validation error');
      const response = await collector.collect(usage);
      expect(response.status).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
    });

    it('fails when validate throws BAD_REQUEST', async() => {
      validatorStub.throws({ badRequest: true }) ;
      const response = await collector.collect(usage);
      expect(response.status).to.equal(httpStatus.BAD_REQUEST);
    });

    it('fails when send throws', async() => {
      sendStub.throws('Sending error');
      const response = await collector.collect(usage);
      expect(response.status).to.equal(httpStatus.INTERNAL_SERVER_ERROR);
    });

    it('fails on account with unsupported license', async() => {
      validatorStub.throws({ unsupportedLicense: true });
      const response = await collector.collect(usage);
      expect(response.status).to.equal(451);
    });
  });
});
