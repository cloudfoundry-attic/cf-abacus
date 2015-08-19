'use strict';

// Test usage poster

const _ = require('underscore');
const request = require('abacus-request');
const commander = require('commander');

const map = _.map;

// Parse command line options
commander
  .option('-c, --collector <uri>',
    'Usage collector URL or domain name [http://localhost:9080]',
    'http://localhost:9080')
  .option(
    '-d, --delta <d>', 'Usage time window shift in milli-seconds', parseInt)
  .parse(process.argv);

// Collector service URL
const collector = /:/.test(commander.collector) ? commander.collector :
  'https://abacus-usage-collector.' + commander.collector;

// Usage time window shift in milli-seconds
const delta = commander.delta || 0;

// Post usage for a resource
const batch = {
  usage: [{
    start: 1420502400000 + delta,
    end: 1420502401000 + delta,
    region: 'us',
    organization_id: 'org_456',
    space_id: 'space_567',
    consumer: {
      type: 'external',
      value: '123'
    },
    resource_id: 'storage',
    plan_id: 'plan_123',
    resource_instance_id: '123',
    metrics: [{
      unit: 'BYTE',
      quantity: 1073741824
    }, {
      unit: 'LIGHT_API_CALL',
      quantity: 10
    }, {
      unit: 'HEAVY_API_CALL',
      quantity: 20
    }]
  }]
};

request.post(collector + '/v1/metering/resource/usage', {
  rejectUnauthorized: false,
  body: batch
}, (err, val) => {
  console.log('Response', err ? err : val.statusCode);
  if(!err) {
    console.log(val.headers.location);
    map(val.body, (loc) => console.log('  %s', loc));
  }
});

