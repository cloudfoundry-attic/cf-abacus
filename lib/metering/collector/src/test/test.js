'use strict';

const requestMock = require('./request-mock.js');

const collector = require('../index.js');
const urienv = require('abacus-urienv');

/* eslint no-unused-expressions: 1 */

describe('collector tests', () => {

  const uris = urienv({
    provisioning: 9880,
    account: 9881
  });

  let usage = {
    start: 1420243200000,
    end: 1420245000000,
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'test-resource',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 12
      }
    ]
  };

  context('submit usage', () => {
    const app = collector();
    let port;

    before(() => {
      port = app.listen();
    });

    const provisioningUri = uris.provisioning +
      '/v1/provisioning/organizations/:organization_id/spaces/' +
      ':space_id/consumers/:consumer_id/resources/:resource_id/plans/' +
      ':plan_id/instances/:resource_instance_id/:time';

    const accountUri = `${uris.account}/v1/organizations/:org_id/account/:time`;

    context('valid usage', () => {
      it('should pass', async() => {
        console.log(provisioningUri, accountUri, requestMock, usage, port);
      });
    });
  });
});
