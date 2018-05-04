const fs = require('fs');
const util = require('util');

const { groupBy, memoize } = require('underscore');

const request = require('abacus-request');
const urienv = require('abacus-urienv');

const usageFile = process.env.USAGE;
const testUsage = usageFile ? it : it.skip;

const uris = memoize(() =>
  urienv({
    collector: 9080,
    reporting: 9088
  })
);

const colorize = (obj) => util.inspect(obj, {
  colors: true,
  compact: true,
  depth: null,
  breakLength: process.stdout.columns
});

describe('usage tests', () => {

  let usageDocs;

  before(() => {
    if (usageFile) {
      console.log('   Loading usage %s ...', usageFile);
      usageDocs = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    }
  });

  testUsage('POSTs all usage successfully', (done) => {

    let calls = 0;
    /* eslint-disable no-unused-expressions */
    const callFinished = (error, response) => {
      const msg = `Response code: ${response.statusCode} body: ${colorize(response.body)}`;

      expect(error).not.to.exist;
      expect(response.statusCode, msg).to.eq(201);
      if (response.body)
        expect(response.body.error, msg).to.not.exist;

      if (++calls === usageDocs.length)
        done();
    };

    for (let usage of usageDocs)
      request.post(`${uris().collector}/v1/metering/collected/usage`, { body: usage }, callFinished);
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
      request.get(`${uris().reporting}/v1/metering/organizations/${org}/aggregated/usage`, {}, callFinished);
  });
});
