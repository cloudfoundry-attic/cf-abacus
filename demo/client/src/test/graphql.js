'use strict';

// Test usage GraphQL query client

const request = require('abacus-request');
const commander = require('commander');

// Parse command line options
commander
  .option('-r, --reporting <uri>',
    'Usage reporting URL or domain name [http://localhost:9088]',
    'http://localhost:9088')
  .parse(process.argv);

// Reporting service URL
const reporting = /:/.test(commander.reporting) ? commander.reporting :
  'https://abacus-usage-reporting.' + commander.reporting;

// Run a usage GraphQL query
//
// Examples:
//
// const query = '{ organization(organization_id:
//  "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420502400000) {
//  organization_id, resources { resource_id, aggregated_usage {
//  metric, windows { quantity }}}}}';
//
// const query = '{ organization(organization_id:
//   "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420502400000) {
//   organization_id, spaces { space_id, resources { resource_id,
//   aggregated_usage { metric, windows { quantity }}}}}}';
//
// const query = '{ organization(organization_id:
//   "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420502400000) {
//   organization_id, spaces { space_id, consumers { consumer_id,
//   resources { resource_id, aggregated_usage { metric,
//   windows { quantity }}}}}}}';
//
// const query = '{ organization(organization_id:
//   "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420502400000) {
//   organization_id, spaces { space_id, consumers { consumer_id }}}}';
//
// const query = '{ organization(organization_id:
//   "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27", time: 1420502400000) {
//   organization_id, resources { resource_id, aggregated_usage {
//   metric, windows { quantity }}}}}';
//
// const query = '{ organizations(organization_ids: [
//   "a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27",
//   "b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28"], time: 1420502400000) {
//   organization_id, resources { resource_id, aggregated_usage {
//   metric, windows { quantity }}}}}';

const query = '{ account(account_id: "1234", time: 1420502400000) { ' +
  'organization_id, resources { resource_id, aggregated_usage { ' +
  'metric, windows { quantity }}}}}';

request.get(reporting + '/v1/metering/aggregated/usage/graph/:query', {
  query: query
}, (err, val) => {
  if(err)
    console.log('Response', err);
  else
    console.log('Response',
      val.statusCode, require('util').inspect(val.body, {
        depth: 10
      }));
});

