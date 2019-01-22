'use strict';
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
  endOfOctoberTwelveAM: moment.utc('2015-10-31').valueOf(),
  endOfOctoberTwelveThirtyAM: moment.utc('2015-10-31 00:30').valueOf(),
  endOfOctoberTwelvePM: moment.utc('2015-10-31 12:00').valueOf(),
  endOfOctoberOneAM: moment.utc('2015-10-31 01:03:20').valueOf(),
  endOfOctoberOneThirtyAM: moment.utc('2015-10-31 01:36:40').valueOf(),
  endOfOctober: moment.utc('2015-10-31').endOf('day').valueOf(),
  startOfNovemberFourAM: moment.utc('2015-11-01 04:00').valueOf(),
  startOfNovemberTenPM: moment.utc('2015-11-01 22:00').valueOf(),
  fourthOfNovemberTenAM: moment.utc('2015-11-04 10:10').valueOf(),
  fifthOfNovemberTenAM: moment.utc('2015-11-05 11:00').valueOf()
};

module.exports = {
  testCollectedUsageID, testResourceID, testOrganizationID, testSpaceID, testConsumerID, testPlanID,
  testResourceType, testAccountID, testMeteringPlanID, testRatingPlanID, testPricingPlanID, testResourceInstanceIDs,
  times
};
