'use strict';

// Test usage poster

const _ = require('underscore');
const request = require('abacus-request');

const map = _.map;

// Take host and time delta parameters
const host = process.argv[2] && isNaN(process.argv[2]) ?
  'https://abacus-usage-collector.' + process.argv[2] : 'http://localhost:9080';
const delta = parseInt(process.argv[2]) || parseInt(process.argv[3]) || 0;

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

request.post(host + '/v1/metering/resource/usage', {
  rejectUnauthorized: false,
  body: batch
}, (err, val) => {
  console.log('Response', err ? err : val.statusCode);
  if(!err) {
    console.log(val.headers.location);
    map(val.body, (loc) => console.log('  %s', loc));
  }
});

