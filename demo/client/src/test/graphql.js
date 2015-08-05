'use strict';

// Test usage GraphQL query client

const request = require('abacus-request');

// Accept a host as parameter
const host = process.argv[2] ? 'https://abacus-usage-reporting.' + process.argv[
  2] : 'http://localhost:9088';

// Run a usage GraphQL query
// const query = '{ organization(organization_guid: "org_456", date:
//   "2015-01-06") { id, organization_guid, services { id, aggregated_usage {
//   unit, quantity}}}}';
// const query = '{ organization(organization_guid: "org_456", date:
//    "2015-01-06") { id, organization_guid, spaces { id, services { id,
//    aggregated_usage { unit, quantity}}}}}';
// const query = '{ organization(organization_guid: "org_456", date:
//   "2015-01-06") { id, organization_guid, spaces { id, consumers { id,
//   services { id, aggregated_usage { unit, quantity}}}}}}';
// const query = '{ organization(organization_guid: "org_456", date:
//   "2015-01-06") { id, organization_guid, spaces { id, consumers { id }}}}';
// const query = '{ organization(organization_guid: "org_456", date:
//   "2015-01-06") { id, organization_guid, services { id, aggregated_usage {
//   unit, quantity}}}}';
// const query = '{ organizations(organization_guids: ["org_456", "org_789"],
//   date: "2015-01-06") { id, organization_guid, services { id,
//   aggregated_usage { unit, quantity}}}}';

const query =
  '{ account(account_id: "1234", date: "2015-01-06") { id, ' +
  'organization_guid, services { id, aggregated_usage { unit, quantity}}}}';

request.get(host + '/v1/metering/aggregated/usage/graph/:query', {
  query: query
}, (err, val) => {
  if (err)
    console.log('Response', err);
  else
    console.log('Response', val.statusCode, require('util').inspect(val.body, {
      depth: 10
    }));
});
