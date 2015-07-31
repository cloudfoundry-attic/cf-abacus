'use strict';

// Test usage report client

const request = require('cf-abacus-request');

// Accept a host as parameter
const host = process.argv[2] ? 'https://cf-abacus-usage-reporting.' + process.argv[2] : 'http://localhost:9088';

// Get a usage report
request.get(host + '/v1/organizations/:organization_guid/usage/:day', { organization_guid: 'org_456', day: '2015-01-06' }, (err, val) => {
    if(err)
        console.log('Response', err);
    else
        console.log('Response', val.statusCode, require('util').inspect(val.body, { depth: 10 }));
});

