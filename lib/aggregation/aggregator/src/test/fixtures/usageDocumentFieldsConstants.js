'use strict';

/* eslint-disable nodate/no-date, nodate/no-moment-without-utc */

const moment = require('abacus-moment');

const testCollectedUsageID = 'collector-id';
const testResourceID = 'test-resource';
const testOrganizationID = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
const testSpaceID = 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a';
const testConsumerID = 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab';
const testPlanID = 'basic';
const testResourceType = 'test-resource-type';
const testAccountID = '1234';
const testMeteringPlanID = 'test-metering-plan';
const testRatingPlanID = 'test-rating-plan';
const testPricingPlanID = 'test-pricing-basic';

const testResourceInstanceIDs = ['0b39fa70-a65f-4183-bae8-385633ca5c87', '1b39fa70-a65f-4183-bae8-385633ca5c88'];

const times = {
  endOfOctoberTwelveAM: moment(Date.UTC(2015, 9, 31)).valueOf(),
  endOfOctoberTwelveThirtyAM: moment(Date.UTC(2015, 9, 31, 0, 30)).valueOf(),
  endOfOctoberTwelvePM: moment(Date.UTC(2015, 9, 31, 12)).valueOf(),
  endOfOctoberOneAM: moment(Date.UTC(2015, 9, 31, 1, 3, 20)).valueOf(),
  endOfOctoberOneThirtyAM: moment(Date.UTC(2015, 9, 31, 1, 36, 40)).valueOf(),
  endOfOctober: moment(Date.UTC(2015, 9, 31, 23, 59, 59, 999)).valueOf(),
  startOfNovemberFourAM: moment(Date.UTC(2015, 10, 1, 4)).valueOf(),
  startOfNovemberTenPM: moment(Date.UTC(2015, 10, 1, 22)).valueOf()
};

module.exports = {
  testCollectedUsageID, testResourceID, testOrganizationID, testSpaceID, testConsumerID, testPlanID,
  testResourceType, testAccountID, testMeteringPlanID, testRatingPlanID, testPricingPlanID, testResourceInstanceIDs, 
  times
};
