'use strict';

const { pick, map } = require('underscore');
const moment = require('abacus-moment');
const seqid = require('abacus-seqid');

const { newSpace, reviveSpace, reviveOrg, newOrg } = require('../lib/models');

describe('models test', () => {
  process.env.SLACK = '2D';

  const id = 'id';

  let space;

  beforeEach(() => {
    space = newSpace('space-id');
    reviveSpace(space);
  });

  context('when consumers are missing', () => {
    const time = moment.now().toString();

    beforeEach(() => {
      space.consumers = undefined;
      space.consumer(id, time);
    });

    it('should create new consumer', () => {
      expect(space.consumers.length).to.equal(1);
      expect(space.consumers).to.deep.equal([{ id: id, t: time }]);
    });
  });

  context('when resources are missing', () => {

    beforeEach(() => {
      space.resources = undefined;
      space.resource(id);
    });

    it('should create new resource', () => {
      expect(space.resources.length).to.equal(1);
      expect(pick(space.resources[0], 'resource_id', 'plans')).to.deep.equal({ resource_id: id, plans: [] });
    });
  });

  context('when creating org', () => {
    it('constructs aggregated usage', () => {
      const expectedQuantites1 = [12, 22, 32, 42, 52];
      const expectedQuantites2 = [112, 122, 132, 142, 152];
      const testRatingPlanID = 'test-rating-plan';
      const testPricingPlanID = 'test-pricing-basic';
      const testMeteringPlanID = 'test-metering-plan';

      const pid = `basic/${testMeteringPlanID}/${testRatingPlanID}/${testPricingPlanID}`;
      const testSeqID = '0001525261459051-0-0-1-0';
      const testOrgID = 'test-org-id';
      const testSpaceID = 'test-space-id';
      const testResource = 'test-resource';
      const testMetric = 'test-metric';
      
      // Helper function for creating windows
      const twindows = (quantities) => map(quantities, (q) => [{ quantity: q }]);

      const resource = (quantities) => {

        return [
          {
            resource_id: testResource,
            plans: [
              {
                plan_id: pid,
                rating_plan_id: testRatingPlanID,
                pricing_plan_id: testPricingPlanID,
                metering_plan_id: testMeteringPlanID,
                aggregated_usage: [
                  {
                    metric: testMetric,
                    windows: twindows(quantities)
                  }
                ]
              }
            ]
          }
        ];
      };

      const buildExpectedDocument = (orgID, spaceID, quantites, seqID) => ({
        organization_id: orgID,
        resources: resource(quantites),
        spaces: [
          {
            space_id: spaceID,
            t: seqid.sample(seqID, 1)
          }
        ]
      });

      // Construct aggregated usage using an org aggregated usage object
      const agg = [];
      agg[0] = newOrg(testOrgID);
      agg[0]
        .resource(testResource)
        .plan(pid)
        .metric(testMetric).windows = twindows(expectedQuantites1);
      agg[0]
        .space(testSpaceID, seqid.sample(testSeqID, 1));

      // Serialize to JSON to simulate db storage and retrieval, and expect
      // the object tree to match
      expect(JSON.parse(JSON.stringify(agg[0]))).to.deep.equal(
        buildExpectedDocument(testOrgID, testSpaceID, expectedQuantites1, testSeqID));

      // Serialize to JSON to simulate db storage and retrieval, then revive
      // the org object behavior
      agg[1] = reviveOrg(JSON.parse(JSON.stringify(agg[0])));
      agg[1]
        .resource(testResource)
        .plan(pid)
        .metric(testMetric).windows = twindows(expectedQuantites2);
      agg[1]
        .space(testSpaceID, seqid.sample(testSeqID, 1));

      // Serialize to JSON to simulate db storage and retrieval, and expect
      // the object tree to match
      expect(JSON.parse(JSON.stringify(agg[1]))).to.deep.equal(
        buildExpectedDocument(testOrgID, testSpaceID, expectedQuantites2, testSeqID));
    });
  });

});
