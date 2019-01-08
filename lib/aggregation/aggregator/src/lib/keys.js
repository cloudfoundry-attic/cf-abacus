'use strict';

const outputKeys = (usageDoc) => {
  const orgAggregationKey = usageDoc.organization_id;
  const consumerAggregationKey = [usageDoc.organization_id, usageDoc.space_id, usageDoc.consumer_id || 'UNKNOWN'];
  const spaceAggregationKey = [usageDoc.organization_id, usageDoc.space_id];
  const markerDocKey = [
    usageDoc.organization_id,
    usageDoc.resource_instance_id,
    usageDoc.consumer_id || 'UNKNOWN',
    usageDoc.plan_id,
    usageDoc.metering_plan_id,
    usageDoc.rating_plan_id,
    usageDoc.pricing_plan_id
  ];

  if(usageDoc.dedup_id)
    markerDocKey.push(usageDoc.dedup_id);

  return [
    orgAggregationKey,
    consumerAggregationKey.join('/'),
    spaceAggregationKey.join('/'),
    markerDocKey.join('/')
  ];
};

const inputKey = (usageDoc) => usageDoc.organization_id;

const sinkKeys = (usageDoc) => [usageDoc.account_id, usageDoc.account_id, undefined];

module.exports = {
  inputKey,
  outputKeys,
  sinkKeys
};
