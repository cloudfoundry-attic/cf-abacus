'use strict';

/* eslint-disable max-len */

const { functioncb, yieldable } = require('abacus-yieldable');
const itemIterator = require('../item-iterator');

describe('paging/item-iterator', () => {
  const sandbox = sinon.sandbox.create();
  const firstPage = ['firstResource','secondResource'];
  const secondPage = ['thirdResource'];

  let pageIterator;

  beforeEach(() => {
    pageIterator = {
      next: sandbox.stub()
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when page iterator yields multiple pages', () => {
    beforeEach(() => {
      pageIterator.next.onCall(0).yields(undefined, firstPage);
      pageIterator.next.onCall(1).yields(undefined, secondPage);
      pageIterator.next.onCall(2).yields(undefined, undefined);
      pageIterator.next.onCall(3).yields(undefined, undefined);
    });

    it('iterates all items across all pages', functioncb(function *() {
      const iterator = itemIterator(pageIterator);
      const yNext = yieldable(iterator.next);

      const firstItem = yield yNext();
      expect(firstItem).to.equal(firstPage[0]);

      const secondItem = yield yNext();
      expect(secondItem).to.equal(firstPage[1]);

      const thirdItem = yield yNext();
      expect(thirdItem).to.equal(secondPage[0]);

      const fourthItem = yield yNext();
      expect(fourthItem).to.equal(undefined);

      const overflowItem = yield yNext();
      expect(overflowItem).to.equal(undefined);
    }));
  });

  context('when page iterator yields error', () => {
    beforeEach(() => {
      pageIterator.next.onFirstCall().yields(new Error('page iterator failure'), undefined);
    });

    it('should yield an error', (done) => {
      const iterator = itemIterator(pageIterator);
      iterator.next((err) => {
        expect(err).to.not.equal(undefined);
        done();
      });
    });

    context('when subsequent page iteration succeeds', () => {
      beforeEach(() => {
        pageIterator.next.onSecondCall().yields(undefined, firstPage);
      });

      it('yield item', (done) => {
        const iterator = itemIterator(pageIterator);
        iterator.next(() => {
          iterator.next((err, item) => {
            expect(err).to.equal(undefined);
            expect(item).to.equal(firstPage[0]);
            done();
          });
        });
      });
    });
  });
});
