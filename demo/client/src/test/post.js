'use strict';

// Test usage poster

const request = require('abacus-request');
const commander = require('commander');

// Parse command line options
commander
  .option('-c, --collector <uri>',
    'Usage collector URL or domain name [http://localhost:9080]',
    'http://localhost:9080')
  .option(
    '-t, --time <t>', 'Usage time in milli-seconds', parseInt)
  .parse(process.argv);

// Collector service URL
const collector = /:/.test(commander.collector) ? commander.collector :
  'https://abacus-usage-collector.' + commander.collector;

// Usage time in milli-seconds
const time = commander.time || Date.now();

// Post usage for a resource
const usage = {
  start: time,
  end: time + 1,
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
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
};

request.post(collector + '/v1/metering/collected/usage', {
  rejectUnauthorized: false,
  body: usage
}, (err, val) => {
  if(err)
    console.log('Error', err);
  if(val) {
    console.log('Status %d', val.statusCode);
    if(val.headers.location)
      console.log('Location %s', val.headers.location);
    if(val.body)
      console.log('Body', val.body);
  }
});

