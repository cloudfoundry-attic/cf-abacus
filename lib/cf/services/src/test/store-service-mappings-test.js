'use strict';

/* eslint-disable no-unused-expressions */

const mappings = require('abacus-ext-plan-mappings');

describe('Test store service mappings', () => {
  const sandbox = sinon.sandbox.create();

  afterEach(()=> {
    sandbox.restore();
  });

  context('when providing correct configuration', () => {
    beforeEach(() => {
      process.env.SERVICES = `{
        "service1":{"plans":["plan1","plan2"]},
        "service2":{"plans":["plan2"]}
      }`;
    });

    it('should store mappings based on the configuration', (done) => {
      sandbox.stub(mappings, 'newMeteringMapping').returns({});
      sandbox.stub(mappings, 'newPricingMapping').returns({});
      sandbox.stub(mappings, 'newRatingMapping').returns({});

      const storeServiceMappings = require('..').storeServiceMappings;
      const rev = { _rev: 1 };

      const verifyCalls = (stub, planId) => {
        expect(stub.firstCall.args).to
          .deep.equal(['service1', 'plan1', planId, rev]);
        expect(stub.secondCall.args).to
          .deep.equal(['service1', 'plan2', planId, rev]);
        expect(stub.thirdCall.args).to
          .deep.equal(['service2', 'plan2', planId, rev]);
      };

      storeServiceMappings((err) => {
        expect(err).to.equal(undefined);
        verifyCalls(mappings.newMeteringMapping, 'standard-service');
        verifyCalls(mappings.newPricingMapping, 'service-pricing-standard');
        verifyCalls(mappings.newRatingMapping, 'service-rating-standard');
        done();
      });
    });

    it('should propagate the error', (done) => {
      sandbox.stub(mappings, 'newMeteringMapping').throws();

      const storeServiceMappings = require('..').storeServiceMappings;

      storeServiceMappings((err) => {
        expect(err).to.be.an('error');
        done();
      });
    });
  });

  it('should propagate an error when configuration is invalid', () => {
    delete require.cache[require.resolve('..')];
    process.env.SERVICES = 'invalid_json';

    expect(() => require('..')).to.throw();
  });

});
