'use strict';

const mappings = require('../mappings');
const extmappings = require('abacus-ext-plan-mappings');

describe('mappings', () => {
  describe('storeServiceMappings', () => {
    const sandbox = sinon.sandbox.create();
    const dependencyErr = new Error('dependency failed');
    const servicesConfig = {
      service1:{
        plans:['plan1','plan2']
      },
      service2:{
        plans:['plan2']
      }
    };
    let newMeteringMappingStub;
    let newPricingMappingStub;
    let newRatingMappingStub;

    beforeEach(() => {
      newMeteringMappingStub =
        sandbox.stub(extmappings, 'newMeteringMapping').returns({});
      newPricingMappingStub =
        sandbox.stub(extmappings, 'newPricingMapping').returns({});
      newRatingMappingStub =
        sandbox.stub(extmappings, 'newRatingMapping').returns({});
    });

    afterEach(()=> {
      sandbox.restore();
    });

    it('should store mappings based on the configuration', (done) => {
      const verifyCalls = (stub, planId) => {
        const rev = { _rev: 1 };
        expect(stub.callCount).to.equal(3);
        expect(stub.firstCall.args).to
          .deep.equal(['service1', 'plan1', planId, rev]);
        expect(stub.secondCall.args).to
          .deep.equal(['service1', 'plan2', planId, rev]);
        expect(stub.thirdCall.args).to
          .deep.equal(['service2', 'plan2', planId, rev]);
      };

      mappings.storeServiceMappings(servicesConfig, (err) => {
        expect(err).to.equal(undefined);
        verifyCalls(newMeteringMappingStub, 'standard-service');
        verifyCalls(newPricingMappingStub, 'service-pricing-standard');
        verifyCalls(newRatingMappingStub, 'service-rating-standard');
        done();
      });
    });

    const itShouldPropagateTheError = () => {
      it('should propagate the error', (done) => {
        mappings.storeServiceMappings(servicesConfig, (err) => {
          expect(err).to.equal(dependencyErr);
          done();
        });
      });
    };

    context('when newMeteringMapping errors', () => {
      beforeEach(() => {
        newMeteringMappingStub.throws(dependencyErr);
      });

      itShouldPropagateTheError();
    });

    context('when newPricingMapping errors', () => {
      beforeEach(() => {
        newPricingMappingStub.throws(dependencyErr);
      });

      itShouldPropagateTheError();
    });

    context('when newPricingMapping errors', () => {
      beforeEach(() => {
        newRatingMappingStub.throws(dependencyErr);
      });

      itShouldPropagateTheError();
    });
  });
});
