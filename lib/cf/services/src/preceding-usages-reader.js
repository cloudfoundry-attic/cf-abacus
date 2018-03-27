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
    let foundPrecedingUsage = false;

    const startId = 't/' + dbclient.pad16(moment.utc().valueOf());
    const endId = 't/' + dbclient.pad16(moment.utc().startOf('month').subtract(1, 'month').valueOf()) + 'ZZZ';
    const descending = true;
    const opts = { startId, endId, pageSize, descending };
    
    const processPageFn = (usageDocs, cb) => {
      debug(`Processing page of ${usageDocs && usageDocs.length ? usageDocs.length : 0} documents`);
      for(let usage of usageDocs) {
        if(foundPrecedingUsage)
          break;
        if(isPreceding(usage, eventDescriptor)) {
          debug('Found preceding usage document %o', usage);
          foundPrecedingUsage = true;
          precedingCreateUsagePlanName = usage.id.split('/')[planNameIndex];
          break;
        }
      }
  
      cb();
    };
    
    debug(`Reading pages from carry over in a given time range between ${opts.startId} and ${opts.endId}`);
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
