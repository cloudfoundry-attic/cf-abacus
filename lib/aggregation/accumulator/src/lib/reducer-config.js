'use strict';
const { map } = require('underscore');
const seqid = require('abacus-seqid');
const urienv = require('abacus-urienv');
// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  aggregator: 9300
});

// Secure the routes or not
const secured = () => process.env.SECURED === 'true';

// Configure reduction result doc sampling, to store reduction results
// in a single doc per min, hour or day for example instead of creating
// a new doc for each new result
const sampling = process.env.SAMPLING;

// Return OAuth system scopes needed to write input docs
const iwscope = () =>
  secured()
    ? { system: ['abacus.usage.write'] }
    : undefined;

// Return OAuth system scopes needed to read input and output docs
const rscope = () =>
  secured()
    ? { system: ['abacus.usage.read'] }
    : undefined;

// Return the keys and times of our docs
const ikey = (udoc) => [
  udoc.organization_id,
  udoc.resource_instance_id,
  udoc.consumer_id || 'UNKNOWN',
  udoc.resource_id,
  udoc.plan_id
].join('/');

const itime = () => seqid();

const igroups = (udoc) => [
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

const okeys = (udoc) => {
  const firstKey = [
    udoc.organization_id,
    udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN',
    udoc.plan_id,
    udoc.metering_plan_id,
    udoc.rating_plan_id,
    udoc.pricing_plan_id
  ];

  const secondKey = [
    udoc.organization_id,
    udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN',
    udoc.resource_id,
    udoc.plan_id
  ];

  if(udoc.dedup_id)
    secondKey.push(udoc.dedup_id);

  return [
    firstKey.join('/'),
    secondKey.join('/')
  ];
};

const skeys = (udoc) => [udoc.organization_id, undefined];

const otimes = (udoc, itime) => [seqid.sample(itime, sampling), map([udoc.end, udoc.start], seqid.pad16).join('/')];

const stimes = (udoc, itime) => [seqid.sample(itime, sampling), undefined];

const reducerConfig = (authFn) => {
  return {
    input: {
      type: 'metered_usage',
      post: '/v1/metering/metered/usage',
      get: '/v1/metering/metered/usage' +
        '/t/:tseq/k/:korganization_id/:kresource_instance_id/:kconsumer_id/:kresource_id/:kplan_id',
      dbname: 'abacus-accumulator-metered-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime,
      groups: igroups
    },
    output: {
      type: 'accumulated_usage',
      get: '/v1/metering/accumulated/usage' +
        '/k/:korganization_id/:kresource_instance_id/:kconsumer_id/:kresource_id/:kplan_id/t/:tend/:tstart',
      dbname: 'abacus-accumulator-accumulated-usage',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: uris.aggregator,
      apps: process.env.AGGREGATOR_APPS,
      posts: ['/v1/metering/accumulated/usage', undefined],
      keys: skeys,
      times: stimes,
      authentication: authFn
    }
  };
};

module.exports = {
  reducerConfig
};
