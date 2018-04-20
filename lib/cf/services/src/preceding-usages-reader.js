'use strict';

const moment = require('abacus-moment');
const dbclient = require('abacus-dbclient');
const yieldable = require('abacus-yieldable');

const debug = require('abacus-debug')('abacus-cf-services-preceding-usages-reader');

const planNameIndex = 7;

const preceedingUsagesReader = (carryOver, pageSize) => {

  const getPrecedingCreatedUsagePlanName = function*(eventDescriptor) {
    let precedingCreateUsagePlanName = undefined;

    const generateKey = (timestamp) => {
      return `t/${timestamp}/` +
        `k/${eventDescriptor.orgGuid}/${eventDescriptor.spaceGuid}/service:${eventDescriptor.serviceInstanceGuid}`;
    };

    const processPageFn = (usageDocs, cb) => {
      debug(`Processing page of ${usageDocs && usageDocs.length ? usageDocs.length : 0} documents`);
      let currentBestTimeStamp = 0;
      for(let usage of usageDocs) 
        if(usage.doc.timestamp >= currentBestTimeStamp) {
          currentBestTimeStamp = usage.doc.timestamp;
          precedingCreateUsagePlanName = usage.id.split('/')[planNameIndex];
        }
  
      cb();
    };
    
    const readAllEvents = yieldable(carryOver.readAllPages);
    
    const startOfCurrentMonth = dbclient.pad16(moment.utc().startOf('month').valueOf());
    const currentMonthKey = generateKey(startOfCurrentMonth);
    yield readAllEvents({ startId: currentMonthKey, endId: currentMonthKey + 'ZZZ', pageSize }, processPageFn);
    
    if (!precedingCreateUsagePlanName) {
      debug('No CREATED usage event found for current month for: %o. Searching previous month', eventDescriptor);
      const startOfPreviousMonth = dbclient.pad16(moment.utc().subtract(1, 'month').startOf('month').valueOf());
      const prevMonthKey = generateKey(startOfPreviousMonth);
      yield readAllEvents({ startId: prevMonthKey, endId: prevMonthKey + 'ZZZ', pageSize }, processPageFn);
    }

    if (!precedingCreateUsagePlanName) 
      debug('No CREATED usage event found for: %o', eventDescriptor);
    
    return precedingCreateUsagePlanName;
  };

  return {
    getPrecedingCreatedUsagePlanName
  };
};

module.exports = preceedingUsagesReader;
