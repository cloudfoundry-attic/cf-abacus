'use strict';

const states = require('../service-event-states');

const carryOverMock = {};
const configMock = {};
const convertEvent = require('../service-event-converter')(carryOverMock, configMock).convertEvent;

describe('service-event-converter', () => {
  const orgGuid = 'org-guid';
  const spaceGuid = 'space-guid';
  const defaultPlanName = 'default-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';
  const serviceInstanceLabel = 'service-instance-label';
  
  

  const sandbox = sinon.sandbox.create();
  
  let event;
  
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

      it('should convert to correct usage', function*() {
        const usage = yield convertEvent(event);
        expect(usage).to.deep.equal([createUsage(1, 0, defaultPlanName)]);
      });
    });

    context('when DELETED event is provided', () => {
      beforeEach(() => {
        event = createEvent(states.DELETED, defaultPlanName);
      });

      it('should convert to correct usage', function*() {
        const usage = yield convertEvent(event);
        expect(usage).to.deep.equal([createUsage(0, 1, defaultPlanName)]);
      });
    });

    context('when UPDATE event is provided', () => {
      const newPlanName = 'new-plan-name';
      const defaultCarryOverPageSize = 10;

      let readAllPagesStub;

      const carryOverDoc0 = { _id: `t/01/k/any/any/any/any/${defaultPlanName}/any` };
      const carryOverDoc1 = { _id: `t/01/k/${serviceInstanceGuid}/any/any/any/${defaultPlanName}/any` };
      const carryOverDoc2 = { _id: `t/02/k/${serviceInstanceGuid}/${orgGuid}/any/any/${defaultPlanName}/any` };
      const carryOverDoc3 = { _id: `t/03/k/${serviceInstanceGuid}/${orgGuid}/${spaceGuid}/any/${defaultPlanName}/any` };

      beforeEach(() => {
        event = createEvent(states.UPDATED, newPlanName);
        
        readAllPagesStub = sandbox.stub();
        const cb = () => {};
        readAllPagesStub.onFirstCall()
          .callsArgWith(1, [carryOverDoc0, carryOverDoc1, carryOverDoc2, carryOverDoc3], cb);
        
        carryOverMock.readAllPages = readAllPagesStub; 

        configMock.pageSize = () => defaultCarryOverPageSize;
      });

      it('calls carryover readAllPages with correct parameters', function*() {
        const any = sinon.match.any;
        
        yield convertEvent(event);
        
        expect(readAllPagesStub
          .calledWith({ startId: any, endId: any, pageSize: defaultCarryOverPageSize, descending: true }))
          .to.be.equal(true);
      });

      it('should convert to correct usage', function*() {
        const usage = yield convertEvent(event);
        expect(usage).to.deep.equal([createUsage(0, 1, defaultPlanName), createUsage(1, 0, newPlanName)]);
      });
    });
  });

  context('when unsupported event is provided', () => {
    beforeEach(() => {
      event = createEvent('unsupported-event', defaultPlanName);
    });

    it('should callback with undefined usage', function*() {
      const usage = yield convertEvent(event);
      expect(usage).to.equal(undefined);
    });
  });
});
