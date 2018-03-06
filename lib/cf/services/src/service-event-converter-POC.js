// --------------------- EVENT CONVERTER
const createUsage = (event) => {
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

const converter = (eventExploder) => {

  const convertEventToUsages = function*(event) {
    // isSupportedState(event)

    const events = yield eventMapper.toMultipleEvents(event);
    if (!events)
      return undefined;

    // const usages = map(events,(event) => createUsage(event));
    return map(events,(event) => createUsage(event));
  };

  return {
    convertEvent: convertEventToUsages
  };
};

module.exports = converter;



//------------------------------ EVENT MAPPER


const eventMapper = (preceedingUsagesReader) => {

  const createCreateUsageEvent = (event) => {
    const createEvent = {
      metadata: extend({}, event.metadata, { created_at: event.metadata.created_at + 1 }),
      entity: extend({}, event.entity, { state: states.CREATED })
    };

    return createEvent;
  };

  const createDeleteUsageEvent = function*(event) {
    const precedingCreatedUsagePlanName = yield preceedingUsagesReader.getPrecedingCreatedUsagePlanName({
      serviceInstanceGuid: event.entity.service_instance_guid,
      orgGuid: event.entity.org_guid,
      spaceGuid: event.entity.space_guid
    });

    // construct new DELETED event from event and preceedingEvent
    const deleteEvent = {
      metadata: event.metadata,
      entity: extend({}, event.entity, { state: states.DELETED, service_plan_name: precedingCreatedUsagePlanName })
    };
    return deleteEvent;
  };

  const selfMapper = {
    map: function*(event) {
      return [event]
    }
  };

  const updateEventMapper = {
    map: function*(event) {
      return [yield createDeleteUsageEvent(event), createCreateUsageEvent(event)]
    }
  };
  
  const mappers = {
    [states.CREATED]: selfMapper,
    [states.DELETED]: selfMapper,
    [states.UPDATED]: updateEventMapper
  }

  const toMultipleEvents = function*(event) {
    if (!isSupported(event))
      return undefined;

    const events = yield mappers[event.entity.state].map(event);
    return events;
  }

  return {
    toMultipleEvents
  }
};

module.exports = eventMapper;


//------------------------------ PRECEDING READER

const isPreceding = (doc, eventDescriptor) => {
  // carry over db entry id field is
  // t/time/k/org_id/space_id/consumer_id/resource_id/plan_id/resource_instance_id
  const currentServiceInstanceGuid = doc.id.split('/')[5].split(':')[1];
  const currentSpaceGuid = doc.id.split('/')[4];
  const currentOrgGuid = doc.id.split('/')[3];
  
  if(currentServiceInstanceGuid !== eventDescriptor.serviceInstanceGuid) 
    return false;
  
  if(currentOrgGuid !== eventDescriptor.orgGuid) 
    return false;
  
  if(currentSpaceGuid !== eventDescriptor.spaceGuid) 
    return false;

  if(doc.state !== states.CREATED) {
    edebug(`Preceding usage has invalid state: ${doc.state}`);
    return false;
  }

  return true;
};

const preceedingUsagesReader = (carryOver, pageSize) => {
  const getPrecedingCreatedUsagePlanName = function*(eventDescriptor) {
    let foundPrecedingUsage = false;
    let precedingCreateUsagePlanName;

    const startId = 't/' + dbclient.pad16(moment.utc().valueOf());
    const endId = 't/' + dbclient.pad16(moment.utc().startOf('month').subtract(1, 'month').valueOf()) + 'ZZZ';
    const pageSize = config.pageSize;
    const descending = true;
    const opts = { startId, endId, pageSize, descending };
    
    // TODO: can we stop carryover itarating over all left pages
    const processPageFn = (usageDocs, cb) => {
      debug(`Processing page of ${usageDocs && usageDocs.length ? usageDocs.length : 0} documents`);
      for(let doc of usageDocs) {
        if(foundPrecedingUsage)
          break;
        
        if(isPreceding(doc, eventDescriptor)) {
          debug('Found preceding usage document %o', doc);
          precedingCreateUsagePlanName = doc.id.split('/')[7];
          foundPrecedingUsage = true;
          break;
        }
      }
  
      cb();
    };
    
    debug('Reading documents in a given time range between start time %s, end time %s', opts.startId, opts.endId);
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
