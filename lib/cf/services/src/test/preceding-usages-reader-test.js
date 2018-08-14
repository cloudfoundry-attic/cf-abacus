'use strict';

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const createReader = require('../preceding-usages-reader');

describe('preceding usages reader tests', () => {
  let sandbox;
  let planName;
  let usagesReader;
  let carryOverFake;

  const defaultPageSize = 10;
  const orgGuid = 'org-guid';
  const spaceGuid = 'space-guid';
  const oldPlanName = 'old-plan-name';
  const expectedPlanName = 'expected-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';
  const currentMontTimestamp = 1522540800000;
  const previousMounthTimestamp = 1519862400000;

  const eventDescriptor = {
    orgGuid,
    spaceGuid,
    serviceInstanceGuid
  };

  const usage1 = { 
    id: `t/any/k/any/any/service:any/any/${oldPlanName}/any`,
    doc: { timestamp: 123 }
  };

  const usage2 = { 
    id: `t/any/k/any/any/service:any/any/${expectedPlanName}/any`,
    doc: { timestamp: 124 }
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(moment, 'utc').returns({ 
      startOf: () => ({ 
        valueOf: () => currentMontTimestamp 
      }),
      subtract: () => ({
        startOf: () => ({
          valueOf: () => previousMounthTimestamp
        })
      })
    });
    carryOverFake = {
      readAllPages: sandbox.stub()
    };
    usagesReader = createReader(carryOverFake, defaultPageSize);
  });

  afterEach(() => {
    planName = undefined;
    sandbox.restore();
  });

  const readAllPagesFakeFn = (usages) => (opt, pageFn, cb) => { 
    pageFn(usages, () => {});
    cb();
  };

  context('when reading current month preceding usages', () => {

    it('should pass correct arguments to carry over', yieldable.functioncb(function*() {
      carryOverFake.readAllPages.onFirstCall().callsFake(readAllPagesFakeFn([usage1, usage2]));
      yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);

      const args = carryOverFake.readAllPages.firstCall.args[0];
      const key = `/k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}`;
      const pageSizeArg = args.pageSize;

      expect(args.startId).to.have.string(key);
      expect(args.endId).to.have.string(key + 'ZZZ');
      expect(pageSizeArg).to.be.equal(defaultPageSize);
    }));

    context('when preceding usage found', () => {
      beforeEach(yieldable.functioncb(function*() {
        carryOverFake.readAllPages.callsFake(readAllPagesFakeFn([usage1, usage2]));
        planName = yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);
      }));
  
      it('should return previous usage plan name', () => {
        assert.calledOnce(carryOverFake.readAllPages);
        expect(planName).to.be.equal(expectedPlanName);
      });     

    });
  });

  context('when reading previous month preceding usages', () => {

    it('should pass correct arguments to carry over', yieldable.functioncb(function*() {
      carryOverFake.readAllPages.onFirstCall().callsFake(readAllPagesFakeFn([]));
      carryOverFake.readAllPages.onSecondCall().callsFake(readAllPagesFakeFn([usage1, usage2]));
      yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);

      const currentMonthStartId = `t/000${currentMontTimestamp}/` + 
        `k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}`;
      const previousMonthStartId = `t/000${previousMounthTimestamp}/` + 
        `k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}`;  
      
      assert.calledWith(carryOverFake.readAllPages.firstCall, 
        { startId: currentMonthStartId, endId: currentMonthStartId + 'ZZZ' , pageSize: defaultPageSize });
      assert.calledWith(carryOverFake.readAllPages.secondCall, 
        { startId: previousMonthStartId, endId: previousMonthStartId + 'ZZZ' , pageSize: defaultPageSize });
    }));

    context('when preceding usage found', () => {

      beforeEach(yieldable.functioncb(function*() {
        carryOverFake.readAllPages.onFirstCall().callsFake(readAllPagesFakeFn([]));
        carryOverFake.readAllPages.onSecondCall().callsFake(readAllPagesFakeFn([usage1, usage2]));
        planName = yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);
      }));
      
      it('should return plan name', () => {
        assert.calledTwice(carryOverFake.readAllPages);
        expect(planName).to.be.equal(expectedPlanName);
      });

    });

    context('when preceding usage not found', () => {
      beforeEach(yieldable.functioncb(function*() {
        carryOverFake.readAllPages.onFirstCall().callsFake(readAllPagesFakeFn([]));
        carryOverFake.readAllPages.onSecondCall().callsFake(readAllPagesFakeFn([]));
        planName = yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);
      }));
      
      it('should return undefined plan name', () => {
        assert.calledTwice(carryOverFake.readAllPages);
        expect(planName).to.be.equal(undefined);
      });

    });
  });
});
