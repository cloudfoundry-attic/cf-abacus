'use strict';

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
  const expectedPlanName = 'default-plan-name';
  const serviceInstanceGuid = 'service-instance-guid';

  const eventDescriptor = {
    orgGuid,
    spaceGuid,
    serviceInstanceGuid
  };

  // carry over db entry, _id field pattern
  // t/time/k/org_id/space_id/consumer_id/resource_id/plan_id/resource_instance_id
  const oldUsage0 = { 
    id: 't/any/k/any/any/service:any/any/any/any'
  };
  const oldUsage1 = { 
    id: `t/any/k/${orgGuid}/any/service:any/any/any/any`
  };
  const oldUsage2 = { 
    id: `t/any/k/${orgGuid}/${spaceGuid}/service:any/any/any/any`
  };
  const precedingUsage = { 
    id: `t/any/k/${orgGuid}/${spaceGuid}/service:${serviceInstanceGuid}/any/${expectedPlanName}/any`
  };

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    carryOverFake = {
      readAllPages: sandbox.stub()
    };
    usagesReader = createReader(carryOverFake, defaultPageSize);
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when reading previous usages', () => {

    beforeEach(yieldable.functioncb(function*() {
      carryOverFake.readAllPages.callsFake((opt, pageFn, cb) => {
        pageFn([oldUsage0, oldUsage1, oldUsage2, precedingUsage], () => {});
        cb();
      });
      planName = yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);
    }));

    it('should pass correct arguments to carry over', yieldable.functioncb(function*() {
      assert.calledOnce(carryOverFake.readAllPages);

      const args = carryOverFake.readAllPages.firstCall.args[0];
      const startIdArg = parseInt(args.startId.split('/')[1]);
      const endIdArg = parseInt(args.endId.split('/')[1].replace('ZZZ', ''));
      const pageSizeArg = args.pageSize;
      const descendingArg = args.descending;

      expect(startIdArg).to.be.greaterThan(endIdArg);
      expect(pageSizeArg).to.be.equal(defaultPageSize);
      expect(descendingArg).to.be.equal(true);
    }));
  });

  context('when preceding usage found', () => {
    beforeEach(yieldable.functioncb(function*() {
      carryOverFake.readAllPages.callsFake((opt, pageFn, cb) => {
        pageFn([oldUsage0, oldUsage1, oldUsage2], () => {
          pageFn([precedingUsage], () => {});
        });
        cb();
      });
      planName = yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);
    }));

    it('should return previous usage plan name', () => {
      expect(planName).to.be.equal(expectedPlanName);
    });
  });

  context('when preceding usage is not found', () => {

    beforeEach(yieldable.functioncb(function*() {
      carryOverFake.readAllPages.callsFake((opt, pageFn, cb) => {
        pageFn([], () => {});
        cb();
      });
      planName = yield usagesReader.getPrecedingCreatedUsagePlanName(eventDescriptor);
    }));

    it('should return undefined', () => {
      expect(planName).to.be.equal(undefined);
    });
  });
});
