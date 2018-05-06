const fs = require('fs');
const util = require('util');

const { groupBy, memoize } = require('underscore');

const oauth = require('abacus-oauth');
const request = require('abacus-request');
const retry = require('abacus-retry');
const urienv = require('abacus-urienv');

const retryableRequest = retry(request, undefined, 1000, 3000);

const usageFile = process.env.USAGE;
const testUsage = usageFile ? it : it.skip;

const uris = memoize(() =>
  urienv({
    collector: 9080,
    reporting: 9088,
    auth_server: 9882
  })
);

const secured = process.env.SECURED === 'true';

const usageToken = secured
  ? oauth.cache(
    uris().auth_server,
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    `abacus.usage.${process.env.RESOURCE_ID}.write abacus.usage.${process.env.RESOURCE_ID}.read`,
    undefined,
    false
  )
  : undefined;

const authHeader = (token) => token ? { authorization: token() } : {};

const colorize = (obj) => util.inspect(obj, {
  colors: true,
  compact: true,
  depth: null,
  breakLength: process.stdout.columns
});

describe('usage tests', () => {

  let usageDocs;

  before((done) => {
    if (usageFile) {
      console.log('   Loading usage %s ...', usageFile);
      usageDocs = JSON.parse(fs.readFileSync(usageFile, 'utf8'));

      if (secured)
        usageToken.start(done);
    } else done();
  });

  testUsage('POSTs all usage successfully', (done) => {

    let calls = 0;
    /* eslint-disable no-unused-expressions */
    const callFinished = (error, response) => {
      expect(error).not.to.exist;

      const msg = `Response code: ${response.statusCode || ''} body: ${colorize(response.body || '')}`;
      expect(response.statusCode, msg).to.eq(201);
      if (response.body)
        expect(response.body.error, msg).to.not.exist;

      process.stdout.write('.');

      if (++calls === usageDocs.length) {
        console.log();
        done();
      }
    };

    process.stdout.write('   ');

    for (let usage of usageDocs)
      retryableRequest.post(`${uris().collector}/v1/metering/collected/usage`, {
        body: usage,
        headers: authHeader(usageToken)
      }, callFinished);
  });

  testUsage('report for all orgs is generated', (done) => {
    const orgs = Object.keys(groupBy(usageDocs, 'organization_id'));
    console.log('   Found %d orgs', orgs.length);

    let calls = 0;
    /* eslint-disable no-unused-expressions */
    const callFinished = (error, response) => {
      expect(error).not.to.exist;
      expect(response.statusCode).to.eq(200);

      console.log(colorize(response.body));

      if (++calls === orgs.length)
        done();
    };

    for (let org of orgs)
      request.get(`${uris().reporting}/v1/metering/organizations/${org}/aggregated/usage`, {
        headers: authHeader(usageToken)
      }, callFinished);
  });
});
