'use strict';

// Test usage poster

const _ = require('underscore');
const request = require('abacus-request');

const map = _.map;

// Take host and time delta parameters
const host = process.argv[2] && isNaN(process.argv[2]) ?
  'https://abacus-usage-collector.' + process.argv[2] : 'http://localhost:9080';
const delta = parseInt(process.argv[2]) || parseInt(process.argv[3]) || 0;

// Post usage for a service
const batch = {
  service_instances: [{
    service_instance_id: '123',
    usage: [{
      start: 1420502400000 + delta,
      end: 1420502401000 + delta,
      plan_id: 'plan_123',
      region: 'us',
      organization_guid: 'org_456',
      space_guid: 'space_567',
      consumer: {
        type: 'external',
        value: '123'
      },
      resources: [{
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
  }]
};

request.post(host + '/v1/metering/services/:service_id/usage', {
  rejectUnauthorized: false,
  service_id: 'storage',
  body: batch
}, (err, val) => {
  console.log('Response', err ? err : val.statusCode);
  if (!err) {
    console.log(val.headers.location);
    map(val.body, (loc) => console.log('  %s', loc));
  }
});
