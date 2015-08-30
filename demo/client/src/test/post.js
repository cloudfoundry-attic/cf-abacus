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
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer: {
      type: 'EXTERNAL',
      consumer_id: 'bbeae239-f3f8-483c-9dd0-de6781c38bab'
    },
    resource_id: 'object-storage',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [{
      measure: 'storage',
      quantity: 1073741824
    }, {
      measure: 'light_api_calls',
      quantity: 1000
    }, {
      measure: 'heavy_api_calls',
      quantity: 100
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

