'use stirct';

/* eslint-disable no-unused-expressions */

const map = require('../../lib/middleware/map');

describe('map tests', () => {
  const testKey = 'test-key';

  let testMap;

  beforeEach(() => {
    testMap = map();
  });

  context('when adding new entry', () => {
    beforeEach(() => {
      testMap.increment(testKey);
    });

    it('entry is added successfully', () => {
      expect(testMap.get(testKey)).to.equal(1);
      expect(testMap.size).to.be.one;
    });
  });

  context('incrementing existing entry', () => {

    beforeEach(() => {
      testMap.increment(testKey);
      testMap.increment(testKey);
    });

    it('entry is updated successfully', () => {
      expect(testMap.get(testKey)).to.equal(2);
    });
  });

  context('decrementing existing entry with value larger than 1', () => {

    beforeEach(() => {
      testMap.increment(testKey);
      testMap.increment(testKey);
      testMap.decrement(testKey);
    });

    it('entry is updated successfully', () => {
      expect(testMap.get(testKey)).to.equal(1);
      expect(testMap.size).to.be.one;
    });
  });

  context('decrementing existing entry with value 1', () => {

    beforeEach(() => {
      testMap.increment(testKey);
      testMap.decrement(testKey);
    });

    it('entry is updated successfully', () => {
      expect(testMap.get(testKey)).to.be.undefined;
      expect(testMap.size).to.be.zero;
    });
  });
});
