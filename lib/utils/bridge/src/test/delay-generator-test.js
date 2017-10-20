'use strict';

const createDelayGenerator = require('../delay-generator');

describe('delay-generator', () => {
  const startValue = 10;
  const maxValue = 20;
  let generator;

  beforeEach(() => {
    generator = createDelayGenerator(startValue, maxValue);
  });

  context('when invoked ', () => {
    let first;
    let second;
    let third;

    beforeEach(() => {
      first = generator.getNext();
      second = generator.getNext();
      third = generator.getNext();
    });

    it('expect exponential values are returned', () => {
      expect(first).to.equal(startValue);
      expect(second).to.equal(startValue + 1);
      expect(third).to.equal(startValue + 6);
    });

    context('when next value is above max value', () => {
      let fourth;

      beforeEach(() => {
        fourth = generator.getNext();
      });

      it('max value is returned', () => {
        expect(fourth).to.equal(maxValue);
      });
    });

    context('when reset ', () => {
      beforeEach(() => {
        generator.reset();
      });

      it('start value is returned', () => {
        expect(generator.getNext()).to.equal(startValue);
      });
    });
  });
});
