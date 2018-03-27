'use strict';

const states = require('../service-event-states');
const convert = require('../service-event-converter');

describe('service-event-converter', () => {
  let event;
  let usage;

  const createEvent = (state) => ({
    metadata: {
      created_at: 1000,
      guid: 'service-guid'
    },
    entity: {
      state,
      org_guid: 'org-guid',
      space_guid: 'space-guid',
      service_label: 'label',
      service_plan_name: 'plan-name',
      service_instance_guid: 'service-instance-guid'
    }
  });

  const createUsage = (current, previous) => ({
    start: 1000,
    end: 1000,
    organization_id: 'org-guid',
    space_id: 'space-guid',
    consumer_id: 'service:service-instance-guid',
    resource_id: 'label',
    plan_id: 'plan-name',
    resource_instance_id: 'service:service-instance-guid:plan-name:label',
    measured_usage: [
      {
        measure: 'current_instances',
        quantity: current
      },
      {
        measure: 'previous_instances',
        quantity: previous
      }
    ]
  });

  context('when CREATED event is provided', () => {
    beforeEach(() => {
      event = createEvent(states.CREATED);
      usage = convert(event);
    });

    it('should convert to correct usage', () => { 
      expect(usage).to.deep.equal(createUsage(1, 0));
    });
  });

  context('when DELETED event is provided', () => {
    beforeEach(() => {
      event = createEvent(states.DELETED);
      usage = convert(event);
    });

    it('should convert to correct usage', () => {
      expect(usage).to.deep.equal(createUsage(0, 1));
    });
  });
});
