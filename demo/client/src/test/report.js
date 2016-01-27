'use strict';

// Test usage report client

const request = require('abacus-request');
const commander = require('commander');

// Parse command line options
commander
  .option('-r, --reporting <uri>',
    'Usage reporting URL or domain name [http://localhost:9088]',
    'http://localhost:9088')
  .option('-o, --org <guid>',
    'guid of cf organization to report on ' +
    '[us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27]',
    'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27')
  .option('-t, --time <timestamp> [1420502400000]',
    'timestamp to report on',
    '1420502400000')
  .parse(process.argv);

// Reporting service URL
const reporting = /:/.test(commander.reporting) ? commander.reporting :
  'https://abacus-usage-reporting.' + commander.reporting;

// Get a usage report
request.get(reporting +
  '/v1/metering/organizations/:organization_id/aggregated/usage/:time', {
    organization_id: commander.org,
    time: commander.time
  }, (err, val) => {
    if(err)
      console.log('Response', err);
    else
      console.log('Response',
        val.statusCode, require('util').inspect(val.body, {
          depth: 10
        }));
  });
