'use strict';

const { extend } = require('underscore');

const dbclient = require('abacus-dbclient');

const { testCollectedUsageID, testResourceID, testOrganizationID, testSpaceID, testConsumerID, testPlanID,
  testResourceType, testAccountID, testMeteringPlanID, testRatingPlanID,
  testPricingPlanID } = require('./fixtures/usageDocumentFieldsConstants');

const _commonBlueprint = {
  collected_usage_id: testCollectedUsageID,
  resource_id: testResourceID,
  organization_id: testOrganizationID,
  space_id: testSpaceID,
  consumer_id: testConsumerID,
  plan_id: testPlanID,
  resource_type: testResourceType,
  account_id: testAccountID,
  metering_plan_id: testMeteringPlanID,
  rating_plan_id: testRatingPlanID,
  pricing_plan_id: testPricingPlanID
};

const buildUsage = (...builders) => {
  const usage = {};
  for(let builder of builders)
    builder(usage);

  return extend(usage, {
    id: dbclient.kturi(usage.resource_instance_id, usage.processed)
  });
};

const withEndTimestamp = (timestamp) => (usage) => usage.end = timestamp;

const withStartTimestamp = (timestamp) => (usage) => usage.start = timestamp;

const withProcessedTimestamp = (timestamp) => (usage) => usage.processed = timestamp;

const withBlueprint = (blueprint) => (usage) => extend(usage, blueprint);
const withDefaultBlueprint = () => (usage) => extend(usage, _commonBlueprint);

const withResourceInstanceId = (resourceInstanceId) => (usage) => usage.resource_instance_id = resourceInstanceId;

const withAccumulatedUsage = (accumulatedUsage) => (usage) => usage.accumulated_usage = accumulatedUsage;

const buildAccumulatedUsage = (...builders) => {
  const accumulatedUsage = { windows: [[null], [null], [null], [null, null, null, null, null, null], [null, null]] };
  for(let builder of builders)
    builder(accumulatedUsage);

  return accumulatedUsage;
};

const withMetricName = (metricName) => (accumulatedUsage) => accumulatedUsage.metric = metricName;

const withCurrentDayQuantity = (quantity) => (accumulatedUsage) =>
  accumulatedUsage.windows[3][0] = { quantity:  quantity };

const withPreviousDayQuantity = (quantity) => (accumulatedUsage) =>
  accumulatedUsage.windows[3][1] = { quantity:  quantity };

const withCurrentMonthQuantity = (quantity) => (accumulatedUsage) =>
  accumulatedUsage.windows[4][0] = { quantity: quantity };

module.exports = {
  buildUsage, withEndTimestamp, withStartTimestamp, withProcessedTimestamp, withBlueprint, withDefaultBlueprint,
  withResourceInstanceId, withAccumulatedUsage, buildAccumulatedUsage, withMetricName, withCurrentDayQuantity,
  withCurrentMonthQuantity, withPreviousDayQuantity
};
