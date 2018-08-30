'use strict';

const { extend } = require('underscore');
const { reducerConfig } = require('../lib/reducer-config');

const rc = reducerConfig(() => {});

describe('reducer config test', () => {
  const dedupId = 'dedup-id';

  let udoc = {
    organization_id: 'org-id',
    resource_instance_id: 'res-instance-id',
    consumer_id: 'consumer-id',
    resource_id: 'resource-id',
    plan_id: 'plan-id'
  };

  context('usage doc does not contain dedup id',() => {
    it('output key is correct', () => {
      expect(rc.output.keys(udoc)[1]).not.to.include(dedupId);
      expect(rc.output.keys(udoc)[1]).to.equal('org-id/res-instance-id/consumer-id/resource-id/plan-id');
    });
  });

  context('usage doc contains dedup id',() => {
    beforeEach(() => {
      udoc = extend(udoc, { dedup_id: dedupId });
    });

    it('output key is correct', () => {
      expect(rc.output.keys(udoc)[1]).to.include(dedupId);
      expect(rc.output.keys(udoc)[1]).to.equal('org-id/res-instance-id/consumer-id/resource-id/plan-id/dedup-id');
    });
  });
});
