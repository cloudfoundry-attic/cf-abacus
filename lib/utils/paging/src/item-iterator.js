'use strict';

const { head, tail } = require('underscore');

const debug = require('abacus-debug')('abacus-paging-item-iterator');
const edebug = require('abacus-debug')('e-abacus-paging-item-iterator');

/**
 * Returns an iterator for iterating over pages, produced by a page iterator.
 *
 * Use the `next` method of the iterator to retrieve the next available item.
 *
 * @param {object} pageIterator the pageIterator instance
 */

const itemIterator = (pageIterator) => {
  let currentPage = [];

  /**
   * Yields the next available item from the current page, or consumes
   * and returns the first item of the next page, until such are available.
   *
   * Next yields an error, should the page iterator yield one.
   *
   * Calling `next` again after an error would retry the same item location,
   * hence a retry logic could be implemented on top, if needed.
   *
   * Next will yield `undefined` as a value once there are no more
   * items available in the current or subsequent pages.
   *
   * Calling `next` after the last item is reached will continue to yield
   * `undefined`.
   *
   * @param {function} cb a callback to handle the read item.
   */
  const next = (cb) => {
    const consumeItem = () => {
      const item = head(currentPage);
      currentPage = tail(currentPage);
      setImmediate(() => {
        cb(undefined, item);
      });
    };

    if (currentPage && currentPage.length > 0) {
      consumeItem();
      return;
    }

    pageIterator.next((err, page) => {
      if (err) {
        edebug('Failed to get item due to: %o', err);
        cb(err);
        return;
      }

      if (!page) {
        debug('No more items available. Iterator at end.');
        cb();
        return;
      }

      currentPage = page;
      consumeItem();
    });
  };

  return {
    next
  };
};

module.exports = itemIterator;
