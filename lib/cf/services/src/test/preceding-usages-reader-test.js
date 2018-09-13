'use strict';

const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const createReader = require('../preceding-usages-reader');

describe('preceding usages reader tests', () => {
  let sandbox;
  let planName;
  let valueOfStub;
  let carryOverFake;
  let getPrecedingPlanName;

  const defaultPageSize = 10;
  const orgGuid = 'org-guid';
  const spaceGuid = 'space-guid';
  const oldPlanName = 'old-plan-name';
  const expectedPlanName = 'expected-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';
  const currentMonthTimestamp = 1522540800000;
  const previousMonthTimestamp = 1519862400000;

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
    valueOfStub = sandbox.stub();
    valueOfStub.onFirstCall().returns(currentMonthTimestamp);
    valueOfStub.onSecondCall().returns(previousMonthTimestamp);
    sandbox.stub(moment, 'utc').returns({
      subtract: () => ({
        startOf: () => ({
          valueOf: valueOfStub
        })
      })
    });
    carryOverFake = {
      readAllPages: sandbox.stub()
    };
    getPrecedingPlanName = createReader(carryOverFake, defaultPageSize);
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

      yield getPrecedingPlanName(eventDescriptor);

      const args = carryOverFake.readAllPages.firstCall.args[0];
      const key = `/k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}`;
      const pageSizeArg = args.pageSize;
      expect(args.startId).to.have.string(key);
      expect(args.endId).to.have.string(key);
      expect(pageSizeArg).to.be.equal(defaultPageSize);
    }));

    context('when preceding usage found', () => {
      beforeEach(() => {
        carryOverFake.readAllPages.callsFake(readAllPagesFakeFn([usage1, usage2]));
      });
  
      it('should return previous usage plan name', yieldable.functioncb(function*() {
        planName = yield getPrecedingPlanName(eventDescriptor);

        assert.calledOnce(carryOverFake.readAllPages);
        expect(planName).to.be.equal(expectedPlanName);
      }));
    });
  });

  context('when reading previous month preceding usages', () => {
    it('should pass correct arguments to carry over', yieldable.functioncb(function*() {
      carryOverFake.readAllPages.onFirstCall().callsFake(readAllPagesFakeFn([]));
      carryOverFake.readAllPages.onSecondCall().callsFake(readAllPagesFakeFn([usage1, usage2]));

      yield getPrecedingPlanName(eventDescriptor);

      const currentMonthStartId =
        `t/000${currentMonthTimestamp}/k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}`;
      const previousMonthStartId =
        `t/000${previousMonthTimestamp}/k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}`;

      assert.calledWith(carryOverFake.readAllPages.firstCall, 
        { startId: currentMonthStartId, endId: currentMonthStartId + 'ZZZ', pageSize: defaultPageSize });
      assert.calledWith(carryOverFake.readAllPages.secondCall, 
        { startId: previousMonthStartId, endId: previousMonthStartId + 'ZZZ', pageSize: defaultPageSize });
    }));

    context('when preceding usage found', () => {
      beforeEach(() => {
        carryOverFake.readAllPages.onFirstCall().callsFake(readAllPagesFakeFn([]));
        carryOverFake.readAllPages.onSecondCall().callsFake(readAllPagesFakeFn([usage1, usage2]));
      });
      
      it('should return plan name', yieldable.functioncb(function*() {
        planName = yield getPrecedingPlanName(eventDescriptor);

        assert.calledTwice(carryOverFake.readAllPages);
        expect(planName).to.be.equal(expectedPlanName);
      }));
    });

    context('when preceding usage not found', () => {
      beforeEach(() => {
        carryOverFake.readAllPages.onFirstCall().callsFake(readAllPagesFakeFn([]));
        carryOverFake.readAllPages.onSecondCall().callsFake(readAllPagesFakeFn([]));
      });
      
      it('should return undefined plan name', yieldable.functioncb(function*() {
        planName = yield getPrecedingPlanName(eventDescriptor);

        assert.calledTwice(carryOverFake.readAllPages);
        expect(planName).to.be.equal(undefined);
      }));
    });
  });
});
