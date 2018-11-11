'use strict';

const moment = require('abacus-moment');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');

const { map } = require('underscore');

const uris = urienv({
  sink: undefined
});

// Return OAuth system scopes needed to write input docs
const iwscope = (secured) => (udoc) =>
  secured
    ? { system: ['abacus.usage.write'] }
    : undefined;

// Return OAuth system scopes needed to read input and output docs
const rscope = (secured) => (udoc) =>
  secured
    ? { system: ['abacus.usage.read'] }
    : undefined;

// Return the keys and times of our docs
const ikey = (udoc) => udoc.organization_id;

const lastMonthId = (timestamp) => seqid(moment.utc(timestamp).endOf('month').valueOf());

const itime = (udoc) => {
  const docTime = udoc.end;
  if (docTime < moment.utc().startOf('month'))
    return lastMonthId(docTime);
  return seqid();
};

const igroups = (udoc) => [
  udoc.organization_id,
  [udoc.organization_id, udoc.space_id, udoc.consumer_id || 'UNKNOWN'].join('/'),
  [udoc.organization_id, udoc.space_id].join('/'),
  [
    udoc.organization_id,
    udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN',
    udoc.plan_id,
    udoc.metering_plan_id,
    udoc.rating_plan_id,
    udoc.pricing_plan_id
  ].join('/')
];

const okeys = (udoc, ikey) => {
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

const skeys = (udoc) => [udoc.account_id, udoc.account_id, undefined];

const otimes = (sampling) => (udoc, itime) => [
  seqid.sample(itime, sampling),
  seqid.sample(itime, sampling),
  seqid.sample(itime, sampling),
  map([udoc.end, udoc.start], seqid.pad16).join('/')
];

const stimes = (sampling) => (udoc, itime) => [seqid.sample(itime, sampling), undefined];

const createDataflowReducerConfig = (secured, sampling, token) => {
  return {
    input: {
      type: 'accumulated_usage',
      post: '/v1/metering/accumulated/usage',
      get: '/v1/metering/accumulated/usage/t/:tseq/k/:korganization_id',
      dbname: 'abacus-aggregator-accumulated-usage',
      wscope: iwscope(secured),
      rscope: rscope(secured),
      key: ikey,
      time: itime,
      groups: igroups
    },
    output: {
      type: 'aggregated_usage',
      get: '/v1/metering/aggregated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-aggregator-aggregated-usage',
      rscope: rscope(secured),
      keys: okeys,
      times: otimes(sampling)
    },
    sink: {
      host: process.env.SINK ? uris.sink : undefined,
      apps: process.env.AGGREGATOR_SINK_APPS,
      posts: ['/v1/metering/aggregated/usage', '/v1/metering/aggregated/usage', undefined],
      keys: skeys,
      times: stimes(sampling),
      authentication: secured ? token : () => {}
    }
  };
};

module.exports = {
  createDataflowReducerConfig
};
