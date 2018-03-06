'use strict';

const moment = require('abacus-moment');
const dbclient = require('abacus-dbclient');
const extend = require('underscore').extend;
const yieldable = require('abacus-yieldable');
const states = require('./service-event-states');

const debug = require('abacus-debug')('abacus-event-bridge-converter');
const edebug = require('abacus-debug')('e-abacus-event-bridge-converter');

const supportedEventStates = [states.CREATED, states.DELETED, states.UPDATED];

const isSupportedState = (state) => {
  return supportedEventStates.includes(state);
};

const isMatching = (doc, event) => {
  // carry over db entry id field is
  // t/time/k/org_id/space_id/consumer_id/resource_id/plan_id/resource_instance_id
  const currentServiceInstanceGuid = doc.id.split('/')[5].split(':')[1];
  const currentSpaceGuid = doc.id.split('/')[4];
  const currentOrgGuid = doc.id.split('/')[3];
  
  if(currentServiceInstanceGuid !== event.entity.service_instance_guid) 
    return false;
  
  if(currentOrgGuid !== event.entity.org_guid) 
    return false;
  
  if(currentSpaceGuid !== event.entity.space_guid) 
    return false;
  
  return true;
};

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

const createUpdateUsage = function*(event, carryOver, config) {
  const getPrecedingCreateServiceEvent = function*(event) {
    let preceding;

    const startId = 't/' + dbclient.pad16(moment.utc().valueOf());
    const endId = 't/' + dbclient.pad16(moment.utc().startOf('month').subtract(1, 'month').valueOf()) + 'ZZZ';
    const pageSize = config.pageSize;
    const descending = true;
    const opts = { startId, endId, pageSize, descending };
    
    const processPageFn = (usageDocs, cb) => {
      debug('Processing page of documents');
      
      for(let doc of usageDocs) 
        if(isMatching(doc, event)) {
          debug('Found matching document %o', doc);
          preceding = doc;
          break;
        }
      cb();
    };
    
    const readAllEvents = yieldable(carryOver.readAllPages);
    debug('Reading documents in a given time range between start time %s, end time %s', opts.startId, opts.endId);
    yield readAllEvents(opts, processPageFn);
    
    if (!preceding) 
      debug('No previous CREATED usage event found for this event %o', event);
    
    return preceding;
  };

  try {
    let precedingCreateServiceEvent = yield getPrecedingCreateServiceEvent(event);
    if(!precedingCreateServiceEvent) {
      debug('No previous CREATED service event found for event %o', event);
      return undefined;
    }

    const precedingPlanName = precedingCreateServiceEvent.id.split('/')[7];
    const deleteEvent = {
      metadata: event.metadata,
      entity: extend({}, event.entity, { state: states.DELETED, service_plan_name: precedingPlanName })
    };
    const createEvent = {
      metadata: extend({}, event.metadata, { created_at: event.metadata.created_at + 1 }),
      entity: extend({}, event.entity, { state: states.CREATED })
    };
    const deleteServiceUsage = yield createDefaultUsage(deleteEvent);
    const createServiceUsage = yield createDefaultUsage(createEvent);
    
    const updateUsage = [deleteServiceUsage[0], createServiceUsage[0]];
    return updateUsage;
  } catch (err) {
    edebug('Error reading from carry over db: %o', err);
    throw err;
  }
};

const converter = (carryOver, config) => {

  const converters = {
    [states.CREATED]: createDefaultUsage,
    [states.DELETED]: createDefaultUsage,
    [states.UPDATED]: createUpdateUsage
  };

  const convertEvent = function*(event) {

    debug('converting event: %j', event);
    const eventState = event.entity.state;
    const createUsage = converters[eventState];

    debug(`creating ${event.entity.state} event usage...`);
    return isSupportedState(eventState) ? yield createUsage(event, carryOver, config) : undefined;
  };

  return {
    convertEvent
  };
};

module.exports = converter;
