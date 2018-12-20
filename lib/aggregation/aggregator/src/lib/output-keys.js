'use strict';

module.exports = (udoc) => {
  const orgAggregationKey = udoc.organization_id;
  const consumerAggregationKey = [udoc.organization_id, udoc.space_id, udoc.consumer_id || 'UNKNOWN'];
  const spaceAggregationKey = [udoc.organization_id, udoc.space_id];
  const markerDocKey = [
    udoc.organization_id,
    udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN',
    udoc.plan_id,
    udoc.metering_plan_id,
    udoc.rating_plan_id,
    udoc.pricing_plan_id
  ];

  if(udoc.dedup_id)
    markerDocKey.push(udoc.dedup_id);

  return [
    orgAggregationKey,
    consumerAggregationKey.join('/'),
    spaceAggregationKey.join('/'),
    markerDocKey.join('/')
  ];
};
