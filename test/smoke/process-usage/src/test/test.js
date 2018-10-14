'use strict';

// Simulate a test service provider that submits usage for a resource and
// verifies the submission by retrieving a usage report.

const oauth = require('abacus-oauth');
const moment = require('abacus-moment');
const request = require('abacus-request');

const httpStatus = require('http-status-codes');
const util = require('util');
const { times } = require('underscore');

const { testEnv } = require('./env-config');
const { buildUsage, createExpectedInitialReport } = require('./fixtures');
const { deltaCompareReports } = require('./report-comparator');
const { getThousandLightApiCallsQuantity, cleanReport } = require('./parse-report-utils');

const doGet = util.promisify(request.get);
const doPost = util.promisify(request.post);

const objectStorageToken = testEnv.secured ?
  oauth.cache(testEnv.authServer, testEnv.objectStorageClientId, testEnv.objectStorageClientSecret,
    'abacus.usage.object-storage.write') : undefined;
const systemToken = testEnv.secured ? 
  oauth.cache(testEnv.authServer, testEnv.systemClientId, testEnv.systemClientSecret, 
    'abacus.usage.read') : undefined;

const authHeader = (token) => token ? { authorization: token() } : {};

const sendUsage = async (usage) => {
  const resp = await doPost(':url/v1/metering/collected/usage', {
    url: testEnv.collectorUrl,
    headers: authHeader(systemToken),
    body: usage
  });
  
  expect(resp.statusCode).to.equal(httpStatus.ACCEPTED);
  return resp.headers.location;
};

const retrieveReport = async (orgID) => {
  const resp = await doGet(':url/v1/metering/organizations/:organization_id/aggregated/usage', {
    url: testEnv.reportingUrl,
    headers: authHeader(systemToken),
    organization_id: orgID
  });
  
  expect(resp.statusCode).to.equal(httpStatus.OK);
  return resp.body;
};

describe('process usage smoke test', function() {
  const testOrgID = 'us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27';
  let currentReport; 

  setEventuallyPollingInterval(testEnv.pollInterval);
  setEventuallyTimeout(testEnv.totalTimeout);

  before(async() => {
    if(testEnv.secured) {
      const startObjectStorageToken = util.promisify(objectStorageToken.start);
      const startSystemToken = util.promisify(systemToken.start);
      
      await startObjectStorageToken();
      await startSystemToken();
    } 

    console.log('\n%s: Retrieving current report', moment.utc().toDate());
    await eventually(async () => {
      currentReport = await retrieveReport(testOrgID);
    });
  });

  it('submits usage for a sample resource and retrieves an aggregated usage report', async function() {
    // Configure the test timeout
    const timeout = Math.max(testEnv.totalTimeout, 40000);
    const now = moment.now();
    const processingDeadline = now + timeout;
    const bytesInGigabyte = 1073741824;

    const quantites = {
      lightApiCalls: 1000,
      heavyApiCalls: 100,
      storage: bytesInGigabyte
    };

    setEventuallyPollingInterval(testEnv.pollInterval);
    setEventuallyTimeout(timeout);

    this.timeout(timeout + 2000);
    console.log('Test will run until %s', moment.utc(processingDeadline).toDate());
    
    console.log('Submitting 10 GB, 1000 light API calls, 100 heavy API calls %d times', testEnv.usageDocumentsCount);
    const sendUsageTasks = [];
    times(testEnv.usageDocumentsCount, (n) => {
      sendUsageTasks.push(sendUsage(buildUsage(testOrgID, now + n, quantites)));
    });
    await Promise.all(sendUsageTasks);
    console.log('\n%s: Usage documets have been sent successfully', moment.utc().toDate());
    
    console.log('\n%s: Retrieving usage report', moment.utc().toDate());
    await eventually(async () => { 
      const updatedReport = await retrieveReport(testOrgID);
      const processedDocs = getThousandLightApiCallsQuantity(currentReport);
      
      expect(getThousandLightApiCallsQuantity(updatedReport)).to.equal(processedDocs + testEnv.usageDocumentsCount);
      
      // quantity and summary fields have the same values
      const expectedValues = {
        lightApiCalls: (testEnv.usageDocumentsCount * quantites.lightApiCalls) / 1000,
        heavyApiCalls: testEnv.usageDocumentsCount * quantites.heavyApiCalls,
        // accumulate function is defined as max
        storage: quantites.storage / bytesInGigabyte
      };
      
      if(!processedDocs) 
        expect(cleanReport(updatedReport)).to.deep.equal(createExpectedInitialReport(
          testOrgID, expectedValues, expectedValues));  
      else 
        deltaCompareReports(cleanReport(updatedReport), currentReport, expectedValues, expectedValues);
    }); 
  });
});
