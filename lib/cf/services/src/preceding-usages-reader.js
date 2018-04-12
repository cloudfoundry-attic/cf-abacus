'use strict';

const moment = require('abacus-moment');
const dbclient = require('abacus-dbclient');
const yieldable = require('abacus-yieldable');

const debug = require('abacus-debug')('abacus-cf-services-preceding-usages-reader');

const orgGuidIndex = 3;
const spaceGuidIndex = 4;
const serviceInstanceGuidIndex = 5;
const planNameIndex = 7;

const isPreceding = (usage, eventDescriptor) => {
  // carry over db entry, id field pattern
  // t/time/k/org_id/space_id/consumer_id/resource_id/plan_id/resource_instance_id
  const currentOrgGuid = usage.id.split('/')[orgGuidIndex];
  const currentSpaceGuid = usage.id.split('/')[spaceGuidIndex];
  const currentServiceInstanceGuid = usage.id.split('/')[serviceInstanceGuidIndex].split(':')[1];

  if(currentOrgGuid !== eventDescriptor.orgGuid) 
    return false;

  if(currentSpaceGuid !== eventDescriptor.spaceGuid) 
    return false;
  
  if(currentServiceInstanceGuid !== eventDescriptor.serviceInstanceGuid) 
    return false;

  return true;
};

const preceedingUsagesReader = (carryOver, pageSize) => {
  const getPrecedingCreatedUsagePlanName = function*(eventDescriptor) {
    let precedingCreateUsagePlanName = undefined;
    // let foundPrecedingUsage = false;
    let currentBestTimeStamp = 0;

    // const startId = 't/' + dbclient.pad16(moment.utc().valueOf());
    // const endId = 't/' + dbclient.pad16(moment.utc().startOf('month').subtract(1, 'month').valueOf()) + 'ZZZ';
    // const descending = true;
    // TODO add keys array
    // const key1 = /^t\/0001522540800000\/k\/08faf06a-7572-4e23-8331-252c7c13e3f2\/123a31b1-0352-4787-9ae8-bd8ef0d3ea40\/service:413ee607-9857-4c7b-aafa-86ce1b225f07/
    const currentMonthTimeStamp = '000' + moment.utc().startOf('month').valueOf() + '000';
    const prevMonthTimeStamp = '000' + moment.utc().subtract(1, 'month').startOf('month').valueOf() + '000';
    const keys = [
      new RegExp(`t/${currentMonthTimeStamp}/${eventDescriptor.orgGuid}/
        ${eventDescriptor.spaceGuid}/service:${eventDescriptor.serviceInstanceGuid}`),
      new RegExp(`t/${prevMonthTimeStamp}/${eventDescriptor.orgGuid}/
        ${eventDescriptor.spaceGuid}/service:${eventDescriptor.serviceInstanceGuid}`)
    ];
    const opts = { keys, pageSize };
    
    const processPageFn = (usageDocs, cb) => {
      debug(`Processing page of ${usageDocs && usageDocs.length ? usageDocs.length : 0} documents`);
      debug('Usages: %o', usageDocs);
      for(let usage of usageDocs) {
        if(usage.doc.timeStamp >= currentBestTimeStamp)
          currentBestTimeStamp = usage.doc.timeStamp;
          precedingCreateUsagePlanName = usage.id.split('/')[planNameIndex];
        // if(foundPrecedingUsage)
        //   break;
        // if(isPreceding(usage, eventDescriptor)) {
        //   debug('Found preceding usage document %o', usage);
        //   foundPrecedingUsage = true;
        //   precedingCreateUsagePlanName = usage.id.split('/')[planNameIndex];
        //   break;
        // }
      }
  
      cb();
    };
    
    debug(`Reading pages from carry over by keys ${opts.keys}`);
    const readAllEvents = yieldable(carryOver.readAllPages);
    yield readAllEvents(opts, processPageFn);
    
    if (!precedingCreateUsagePlanName) 
      debug('No previous CREATED usage event found for this event %o', eventDescriptor);
    
    return precedingCreateUsagePlanName;
  };

  return {
    getPrecedingCreatedUsagePlanName
  };
};

module.exports = preceedingUsagesReader;
