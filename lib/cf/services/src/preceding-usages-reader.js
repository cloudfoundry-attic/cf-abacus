'use strict';

const moment = require('abacus-moment');
const dbclient = require('abacus-dbclient');
const yieldable = require('abacus-yieldable');

const debug = require('abacus-debug')('abacus-cf-services-preceding-usages-reader');

const generateKey = (timestamp, eventDescr) =>
  `t/${timestamp}/k/${eventDescr.orgGuid}/${eventDescr.spaceGuid}/service:${eventDescr.serviceInstanceGuid}`;

const searchMonth = function*(readAllEvents, startOfMonth, eventDescriptor, pageSize) {
  let planName = undefined;
  const processPageFn = (usageDocs, cb) => {
    debug(`Processing page of ${usageDocs.length} documents`);
    const planNameIndex = 7;
    let currentBestTimeStamp = 0;
    for(let usage of usageDocs)
      if(usage.doc.timestamp >= currentBestTimeStamp) {
        currentBestTimeStamp = usage.doc.timestamp;
        planName = usage.id.split('/')[planNameIndex];
      }
    cb();
  };

  const monthKey = generateKey(startOfMonth, eventDescriptor);
  yield readAllEvents({ startId: monthKey, endId: monthKey + 'ZZZ', pageSize }, processPageFn);
  return planName;
};

const searchMonths = function*(numberOfMonths, eventReader, eventDescriptor, pageSize) {
  for(let i = 0; i < numberOfMonths; i++) {
    const startOfMonth = dbclient.pad16(moment.utc().subtract(i, 'month').startOf('month').valueOf());
    const planName = yield searchMonth(eventReader, startOfMonth, eventDescriptor, pageSize);
    if(planName)
      return planName;
  }

  return undefined;
};

const precedingUsagesReader = (carryOver, pageSize) => {
  return function*(eventDescriptor) {
    const eventReader = yieldable(carryOver.readAllPages);
    const numberOfMonthsToSearch = 2;
    let planName = yield searchMonths(numberOfMonthsToSearch, eventReader, eventDescriptor, pageSize);

    return planName;
  };
};

module.exports = precedingUsagesReader;
