'use strict';

const states = require('../service-event-states');
const yieldable = require('abacus-yieldable');

const carryOverMock = {};
const configMock = {};
const convertEvent = require('../service-event-converter')(carryOverMock, configMock).convertEvent;

describe('service-event-converter', () => {
  let event;

  const orgGuid = 'org-guid';
  const spaceGuid = 'space-guid';
  const defaultPlanName = 'default-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';
  const serviceInstanceLabel = 'service-instance-label';
  
  const sandbox = sinon.sandbox.create();
  
  const createEvent = (state, planName) => ({
    metadata: {
      created_at: 1000,
      guid: 'event-guid'
    },
    entity: {
      state,
      org_guid: orgGuid,
      space_guid: spaceGuid,
      service_label: serviceInstanceLabel,
      service_plan_name: planName,
      service_instance_guid: serviceInstanceGuid
    }
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  context('when supported event is provided', () => {
    const createUsage = (current, previous, planName) => ({
      start: 1000,
      end: 1000,
      organization_id: orgGuid,
      space_id: spaceGuid,
      consumer_id: `service:${serviceInstanceGuid}`,
      resource_id: serviceInstanceLabel,
      plan_id: planName,
      resource_instance_id: `service:${serviceInstanceGuid}:${planName}:${serviceInstanceLabel}`,
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
        event = createEvent(states.CREATED, defaultPlanName);
      });

      it('should convert to correct usage', yieldable.functioncb(function*() {
        const usage = yield convertEvent(event);

        expect(usage).to.deep.equal([createUsage(1, 0, defaultPlanName)]);
      }));
    });

    context('when DELETED event is provided', () => {
      beforeEach(() => {
        event = createEvent(states.DELETED, defaultPlanName);
      });

      it('should convert to correct usage', yieldable.functioncb(function*() {
        const usage = yield convertEvent(event);

        expect(usage).to.deep.equal([createUsage(0, 1, defaultPlanName)]);
      }));
    });

    context('when UPDATE event is provided', () => {
      let readAllPagesStub;

      const newPlanName = 'new-plan-name';
      const defaultCarryOverPageSize = 10;
      
      beforeEach(() => {
        event = createEvent(states.UPDATED, newPlanName);

        // carry over db entry id field pattern
        // t/time/k/org_id/space_id/consumer_id/resource_id/plan_id/resource_instance_id
        const doc0 = { id: `t/03/k/${orgGuid}/any/service:any/any/any/any` };
        const doc1 = { id: `t/02/k/${orgGuid}/${spaceGuid}/service:any/any/any/any` };
        const doc2 = { id: `t/01/k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}/any/${defaultPlanName}/any` };
        
        readAllPagesStub = sandbox.stub();
        readAllPagesStub.callsFake((opt, pageFn, cb) => {
          pageFn([doc0, doc1, doc2], () => {});
          cb();
        });
        
        carryOverMock.readAllPages = readAllPagesStub; 
        configMock.pageSize = defaultCarryOverPageSize;

      });

      it('calls carryover readAllPages with correct parameters', yieldable.functioncb(function*() {
        yield convertEvent(event);

        const args = readAllPagesStub.firstCall.args[0];
        expect(readAllPagesStub.callCount).to.be.equal(1);
        expect(args.pageSize).to.be.equal(defaultCarryOverPageSize); 
        expect(args.descending).to.be.equal(true); 
        expect(args.startId).to.be.greaterThan(args.endId);
      }));

      it('should convert to correct usage', yieldable.functioncb(function*() {
        const usage = yield convertEvent(event);
        
        const expectedDeleteUsage = createUsage(0, 1, defaultPlanName);
        const expectedCreateUsage = createUsage(1, 0, newPlanName);
        expectedCreateUsage.start += 1;
        expectedCreateUsage.end += 1;
        
        expect(usage).to.deep.equal([expectedDeleteUsage, expectedCreateUsage]);
      }));
    });
  });

  context('when unsupported event is provided', () => {
    beforeEach(() => {
      event = createEvent('unsupported-event', defaultPlanName);
    });

    it('should callback with undefined usage', yieldable.functioncb(function*() {
      const usage = yield convertEvent(event);

      expect(usage).to.equal(undefined);
    }));
  });
});
