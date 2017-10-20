'use strict';

const states = require('../app-event-states');
const convert = require('../app-event-converter');

describe('app-event-converter', () => {
  const sandbox = sinon.sandbox.create();
  const appEventGuid = 'app-event-guid';

  let event;

  /* eslint complexity: [0, 7] */
  const createEvent = (opts) => ({
    metadata: {
      created_at: 1000,
      guid: appEventGuid
    },
    entity: {
      state: opts.state || states.STARTED,
      previous_state: opts.previousState || states.STOPPED,
      org_guid: 'org-guid',
      space_guid: 'space-guid',
      app_guid: 'app-guid',
      instance_count: opts.instanceCount || 5,
      previous_instance_count: opts.previousInstanceCount || 3,
      memory_in_mb_per_instance: opts.memoryPerInstance || 2,
      previous_memory_in_mb_per_instance: opts.previousMemoryPerInstance || 6
    }
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when supported event is provided', () => {
    const createUsage = (opts) => ({
      start: 1000,
      end: 1000,
      organization_id: 'org-guid',
      space_id: 'space-guid',
      consumer_id: 'app:app-guid',
      resource_id: 'linux-container',
      plan_id: 'standard',
      resource_instance_id: 'memory:app-guid',
      measured_usage: [{
        measure: 'current_instance_memory',
        quantity: opts.current_instance_memory
      },{
        measure: 'current_running_instances',
        quantity: opts.current_running_instances
      },{
        measure: 'previous_instance_memory',
        quantity: opts.previous_instance_memory
      },{
        measure: 'previous_running_instances',
        quantity: opts.previous_running_instances
      }]
    });

    context('when STARTED event is provided', () => {
      context('when previous state was STOPPED', () => {
        beforeEach(() => {
          event = createEvent({
            state: states.STARTED,
            previousState: states.STOPPED
          });
        });

        it('should convert to correct usage', () => {
          const usage = convert(event);
          expect(usage).to.deep.equal(createUsage({
            current_instance_memory: 2 * 1048576,
            current_running_instances: 5,
            previous_instance_memory: 0,
            previous_running_instances: 0
          }));
        });
      });

      context('when previous state was not STOPPED', () => {
        context('when previous and current values match', () => {
          beforeEach(() => {
            event = createEvent({
              state: states.STARTED,
              previousState: states.BUILDPACK_SET,
              instanceCount: 2,
              memoryPerInstance: 3,
              previousInstanceCount: 2,
              previousMemoryPerInstance: 3
            });
          });

          it('should convert to correct usage', () => {
            const usage = convert(event);
            expect(usage).to.deep.equal(createUsage({
              current_instance_memory: 3 * 1048576,
              current_running_instances: 2,
              previous_instance_memory: 0,
              previous_running_instances: 0
            }));
          });
        });

        context('when previous and current values dont match', () => {
          beforeEach(() => {
            event = createEvent({
              state: states.STARTED,
              previousState: states.BUILDPACK_SET
            });
          });

          it('should convert to correct usage', () => {
            const usage = convert(event);
            expect(usage).to.deep.equal(createUsage({
              current_instance_memory: 2 * 1048576,
              current_running_instances: 5,
              previous_instance_memory: 6 * 1048576,
              previous_running_instances: 3
            }));
          });
        });
      });
    });

    context('when STOPPED event is provided', () => {
      beforeEach(() => {
        event = createEvent({
          state: states.STOPPED
        });
      });

      it('should callback with correct usage', () => {
        const usage = convert(event);
        expect(usage).to.deep.equal(createUsage({
          current_instance_memory: 0,
          current_running_instances: 0,
          previous_instance_memory: 6 * 1048576,
          previous_running_instances: 3
        }));
      });
    });
  });

  context('when unsupported event is provided', () => {
    beforeEach(() => {
      event = createEvent({
        state:states.BUILDPACK_SET
      });
    });

    it('should callback with undefined usage', () => {
      const usage = convert(event);
      expect(usage).to.equal(undefined);
    });
  });
});
