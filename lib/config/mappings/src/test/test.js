'use strict';

const mappings = require('..');

describe('abacus-plan-mappings', () => {

  it('exports sample JSONs', () => {
    expect(mappings.sampleMetering).to.not.equal(undefined);
    expect(mappings.samplePricing).to.not.equal(undefined);
    expect(mappings.sampleRating).to.not.equal(undefined);
  });

});
