'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

const { buildUsage, withEndTimestamp, withStartTimestamp, withProcessedTimestamp, withDefaultBlueprint, withBlueprint,
  withResourceInstanceId, withAccumulatedUsage, buildAccumulatedUsage, withMetricName, withCurrentDayQuantity, 
  withCurrentMonthQuantity } = require('../usage-builder');
 
const { testResourceInstanceIDs } = require('./usageDocumentFieldsConstants');   

const { aggregatesInitialUsageExpected } = require('./expected/expectedForInitialAggregatedUsage'); 
const { aggregatesWithExistingResourceExpected } = require('./expected/expectedFoAggregateWithExistingUsage');
const { shiftsMonthWindowsExpected } = require('./expected/expectedForShiftWindows');
const { aggregatesToZeroExpected } = require('./expected/expectedForAggregatesWithZero');
const { previousMonthExpected } = require('./expected/expectedForPreviousMonth');
 
// =======================================================================
// 1446249600000 -> Saturday, October 31, 2015 12:00:00 AM
// 1420245000000 -> 1446251400000

const endOfOctoberTwelveAM = 1446249600000;
const endOfOctoberTwelveThirtyAM = 1446251400000;
const usageForAggregatesInitialUsage = buildUsage(
  withDefaultBlueprint(), 
  withResourceInstanceId(testResourceInstanceIDs[0]),
  withStartTimestamp(endOfOctoberTwelveAM),
  withEndTimestamp(endOfOctoberTwelveThirtyAM),
  withProcessedTimestamp(endOfOctoberTwelveThirtyAM + 1),
  withAccumulatedUsage([
    buildAccumulatedUsage(
      withMetricName('heavy_api_calls'),
      withCurrentDayQuantity({ current: 12 }),
      withCurrentMonthQuantity({ current: 12 })
    ),
    buildAccumulatedUsage(
      withMetricName('memory'),
      withCurrentDayQuantity({ current: {
        consumed: 518400000,
        consuming: 6,
        since: endOfOctoberTwelveAM
      } }),
      withCurrentMonthQuantity({ current: {
        consumed: 13996800000,
        consuming: 6,
        since: endOfOctoberTwelveAM
      } })
    )
  ]
  ));

// 1446251400000 -> 
// 1420247000000 -> 1446253400000 ->  Saturday, October 31, 2015 1:03:20 AM
const endOfOctoberOneAM = 1446253400000;
const endOfOctoberOneThirtyAM = 1446255400000;
const aggregatesUsageWithExistingResource = {
  withSameResourceId: buildUsage(
    withDefaultBlueprint(),
    withResourceInstanceId(testResourceInstanceIDs[0]),
    withStartTimestamp(endOfOctoberTwelveThirtyAM),
    withEndTimestamp(endOfOctoberOneAM),
    withProcessedTimestamp(endOfOctoberOneAM + 1),
    withAccumulatedUsage([
      buildAccumulatedUsage(
        withMetricName('heavy_api_calls'),
        withCurrentDayQuantity({ previous: 12, current: 22 }),
        withCurrentMonthQuantity({ previous: 12, current: 22 })
      ),
      buildAccumulatedUsage(
        withMetricName('memory'),
        withCurrentDayQuantity({
          previous: {
            consumed: 518400000,
            consuming: 6,
            since: endOfOctoberTwelveAM
          },
          current: { 
            consumed: 684000000, 
            consuming: 8, 
            since: endOfOctoberTwelveThirtyAM }
        }),
        withCurrentMonthQuantity({
          previous: {
            consumed: 13996800000,
            consuming: 6,
            since: endOfOctoberTwelveAM
          },
          current: {
            consumed: 18655200000,
            consuming: 8,
            since: endOfOctoberTwelveThirtyAM
          }
        })
      )  
    ])
  ),
  // 1420247000000 -> 1446253400000
  // 1420249000000 -> 1446255400000 -> Saturday, October 31, 2015 1:36:40 AM
  withDifferentResourceId: buildUsage(
    withDefaultBlueprint(),
    withResourceInstanceId(testResourceInstanceIDs[1]),
    withStartTimestamp(endOfOctoberOneAM),
    withEndTimestamp(endOfOctoberOneThirtyAM),
    withProcessedTimestamp(endOfOctoberOneThirtyAM + 1),
    withAccumulatedUsage([
      buildAccumulatedUsage(
        withMetricName('heavy_api_calls'),
        withCurrentDayQuantity({ current: 8 }),
        withCurrentMonthQuantity({ current: 8 })
      ),
      buildAccumulatedUsage(
        withMetricName('memory'),
        withCurrentDayQuantity({
          current: {
            consumed: 236400000,
            consuming: 3,
            since: endOfOctoberOneAM
          }
        }),
        withCurrentMonthQuantity({
          current: {
            consumed: 6975600000,
            consuming: 3,
            since: endOfOctoberOneAM
          }
        })
      )  
    ])
  )
};

// for two months test
//  Sunday, November 1, 2015 8:00:00 AM -> 1446364800000
//  Sunday, November 1, 2015 4:00:00 AM -> 1446350400000
// const startOfNovemberEightAM = 1446364800000;
const startOfNovemberFourAM = 1446350400000;
const usageForShiftsCorrectly = [
  buildUsage(
    withBlueprint(usageForAggregatesInitialUsage),
    withAccumulatedUsage([
      buildAccumulatedUsage(
        withMetricName('heavy_api_calls'),
        withCurrentDayQuantity({ current: 12 }),
        withCurrentMonthQuantity({ current: 12 })
      )])
  ),
  buildUsage(
    withBlueprint(usageForAggregatesInitialUsage),
    withProcessedTimestamp(endOfOctoberTwelveThirtyAM + 2),
    withStartTimestamp(endOfOctoberTwelveThirtyAM),
    withEndTimestamp(startOfNovemberFourAM),
    withAccumulatedUsage([
      buildAccumulatedUsage(
        withMetricName('heavy_api_calls'),
        withCurrentDayQuantity({ previous: 12, current: 22 }),
        withCurrentMonthQuantity({ previous: 12, current: 22 })
      )]))
];

const aggregatesWithZeroUsage = [
  usageForShiftsCorrectly[0],
  buildUsage(
    withBlueprint(usageForShiftsCorrectly[0]),
    withStartTimestamp(endOfOctoberTwelveThirtyAM),
    withEndTimestamp(endOfOctoberOneAM),
    withProcessedTimestamp(endOfOctoberOneAM + 1),
    withAccumulatedUsage([
      buildAccumulatedUsage(
        withMetricName('heavy_api_calls'),
        withCurrentDayQuantity({ previous: 12, current: 0 }),
        withCurrentMonthQuantity({ previous: 12, current: 0 })
      )])
  )
];


const previousMonthUsage = [
  usageForShiftsCorrectly[0],
  buildUsage(
    withBlueprint(usageForShiftsCorrectly[0]),
    withStartTimestamp(startOfNovemberFourAM),
    withEndTimestamp(startOfNovemberFourAM + 1),
    withProcessedTimestamp(startOfNovemberFourAM + 2),
    withAccumulatedUsage([
      buildAccumulatedUsage(
        withMetricName('heavy_api_calls'),
        withCurrentDayQuantity({ previous: 12, current: 22 }),
        withCurrentMonthQuantity({ previous: 12, current: 22 })
      )])
  )
];

const previousMonthFixture = {
  usage: previousMonthUsage,
  expected: previousMonthExpected
};

const aggregatesInitialUsageFixture = {
  usage: usageForAggregatesInitialUsage,
  expected: aggregatesInitialUsageExpected
};

const aggregatesWithExisitingUsageFixture = {
  usage: aggregatesUsageWithExistingResource,
  expected: aggregatesWithExistingResourceExpected
};

const shiftsMonthWindowsFixture = {
  usage: usageForShiftsCorrectly,
  expected: shiftsMonthWindowsExpected
};

const aggregatesWithZeroFixture = {
  usage: aggregatesWithZeroUsage,
  expected: aggregatesToZeroExpected
};

const createUnprocessableEntityUsage = (quantity) => buildUsage(
  withBlueprint(aggregatesUsageWithExistingResource.withSameResourceId),
  withAccumulatedUsage([buildAccumulatedUsage(
    withMetricName('heavy_api_calls'),
    withCurrentDayQuantity({ current: quantity }),
    withCurrentMonthQuantity({ current: quantity })
  )]));

const unprocessableEntityFixture = {
  withNull: createUnprocessableEntityUsage(null),
  withNaN: createUnprocessableEntityUsage(NaN),
  withUndefined: createUnprocessableEntityUsage(undefined)
};

module.exports = { 
  aggregatesInitialUsageFixture, aggregatesWithExisitingUsageFixture, shiftsMonthWindowsFixture, 
  aggregatesWithZeroFixture, unprocessableEntityFixture, previousMonthFixture
};
