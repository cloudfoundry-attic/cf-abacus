'use strict';

const { extend } = require('underscore');

const docid = require('..');

describe('abacus-docid', () => {
  context('createMeterDocId tests', () => {
    const usageDoc = {
      start: 1420243200000,
      end: 1420245000000,
      organization_id: 'org-id',
      space_id: 'space-id',
      consumer_id: 'consumer-id',
      resource_id: 'resource-id',
      plan_id: 'plan-id',
      resource_instance_id: 'resource-instance-id'
    };
    const expectedId = 't/0001420245000000/k/org-id/space-id/consumer-id/resource-id/plan-id/resource-instance-id';

    it('creates meter document id without dedup id', () => {
      const id = docid.createMeterId(usageDoc);
      expect(id).to.equal(expectedId);
    });

    it('creates meter document id with dedup id', () => {
      const id = docid.createMeterId(extend({}, usageDoc, { dedup_id: 'dedup-id' }));
      expect(id).to.equal(`${expectedId}/dedup-id`);
    });
  });
});
