'use strict';

const states = require('./service-event-states');
const moment = require('abacus-moment');
const extend = require('underscore').extend;
const dbclient = require('abacus-dbclient');
const yieldable = require('abacus-yieldable');

const debug = require('abacus-debug')('abacus-event-bridge-converter');
const edebug = require('abacus-debug')('e-abacus-event-bridge-converter');

const supportedEventStates = [states.CREATED, states.DELETED, states.UPDATED];

const isSupportedState = (state) => {
  return supportedEventStates.includes(state);
};

const converter = (carryOver, config) => {

  const createDefaultUsage = function*(event) {
    debug(`Creating ${event.entity.state} usage document`);
  
    const eventTime = moment.utc(event.metadata.created_at).valueOf();
    const serviceGUID = `service:${event.entity.service_instance_guid}`;
    const serviceLabel = event.entity.service_label;
    const planName = event.entity.service_plan_name;
    
    return [{
      start: eventTime,
      end: eventTime,
      organization_id: event.entity.org_guid,
      space_id: event.entity.space_guid,
      consumer_id: serviceGUID,
      resource_id: serviceLabel,
      plan_id: planName,
      resource_instance_id: `${serviceGUID}:${planName}:${serviceLabel}`,
      measured_usage: [
        {
          measure: 'current_instances',
          quantity: event.entity.state === states.CREATED ? 1 : 0
        },
        {
          measure: 'previous_instances',
          quantity: event.entity.state === states.CREATED ? 0 : 1
        }
      ]
    }];
  };
  
  const createUpdateUsage = function*(event) {
      
    let updateUsage;
  
    const startId = 't/' + dbclient.pad16(moment.utc().valueOf());
    const endId = 't/' + dbclient.pad16(moment.utc().startOf('month').subtract(1, 'month').valueOf()) + 'ZZZ';
    const pageSize = config.pageSize;
    const descending = true;
    const opts = { startId, endId, pageSize, descending };
    
    const processPage = function*(usageDocs) {
      debug('Processing page of documents');
      
      const isMatching = (doc, event) => {
        const currentServiceInstanceGuid = doc.id.split('/')[5].split(':')[1];
        const currentOrgGuid = doc.id.split('/')[3];
        const currentSpaceGuid = doc.id.split('/')[4];
  
        if(currentServiceInstanceGuid !== event.entity.service_instance_guid) 
          return false;
        
        if(currentOrgGuid !== event.entity.org_guid) 
          return false;
        
        if(currentSpaceGuid !== event.entity.space_guid) 
          return false;
        
        return true;
      };
  
      for(let doc of usageDocs) 
        if(isMatching(doc, event)) {
          debug('Found matching document');
          const oldPlanName = doc.id.split('/')[7];
  
          const deleteEventEntity = extend({}, event.entity, { state: states.DELETED, service_plan_name: oldPlanName });
          const createEventEntity = extend({}, event.entity, { state: states.CREATED });
          
          const deleteUsage = yield createDefaultUsage(extend({}, event, { entity: deleteEventEntity }));
          const createUsage = yield createDefaultUsage(extend({}, event, { entity: createEventEntity }));
          
          updateUsage = [deleteUsage[0], createUsage[0]];
          break;
        }
    };
  
    try {
      const yReadAllPages = yieldable(carryOver.readAllPages);
  
      debug('Reading documents in a given time range between start time %s, end time %s', opts.startId, opts.endId);
      yield yReadAllPages(opts, yieldable.functioncb(processPage));
    } catch (err) {
      edebug('Error reading from carry over db: %o', err);
      throw err;
    }
    
    return updateUsage;
  };

  const converters = {
    CREATED: createDefaultUsage,
    DELETED: createDefaultUsage,
    UPDATED: createUpdateUsage
  };

  const convertEvent = function*(event) {

    debug('converting event: %j', event);
    const eventState = event.entity.state;
    const createUsage = converters[eventState];

    debug(`creating ${event.entity.state} event usage...`);
    return isSupportedState(eventState) ? yield createUsage(event) : undefined;
  };

  return {
    convertEvent
  };
};

module.exports = converter;
