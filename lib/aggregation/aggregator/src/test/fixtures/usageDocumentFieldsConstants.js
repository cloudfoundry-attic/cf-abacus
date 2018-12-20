'use strict';

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
  endOfOctoberTwelveAM: 1446249600000, // Saturday, October 31, 2015 12:00:00 AM
  endOfOctoberTwelveThirtyAM: 1446251400000, // Saturday, October 31, 2015 12:30:00 AM
  endOfOctoberTwelvePM: 1446292800000, // Saturday, October 31, 2015 12:00:00 PM
  endOfOctoberOneAM: 1446253400000, // Saturday, October 31, 2015 1:03:20 AM
  endOfOctoberOneThirtyAM: 1446255400000, // Saturday, October 31, 2015 1:36:40 AM
  startOfNovemberFourAM: 1446350400000, // Sunday, November 1, 2015 4:00:00 AM
  startOfNovemberTenPM: 1446415200000, // Sunday, November 1, 2015 10:00:00 PM
  endOfOctober: 1446335999999 // Saturday, October 31, 2015 11:59:59 PM
};

module.exports = {
  testCollectedUsageID, testResourceID, testOrganizationID, testSpaceID, testConsumerID, testPlanID,
  testResourceType, testAccountID, testMeteringPlanID, testRatingPlanID, testPricingPlanID, testResourceInstanceIDs, 
  times
};
