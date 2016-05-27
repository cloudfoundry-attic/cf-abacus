// Simple functional operators similar to the underscore.js map, forEach, etc
// but working on ECMAScript 6 iterables instead of arrays and objects.

import * as util from 'util';
import {
  iterator, iterable, map, filter, keys, range, singleton, first, take,
  drop, toArray, zip, join, length, reduce } from '..';

describe('abacus-iterable', () => {
  it('implements functional operators on iterable lists', () => {
    const array = (i) => Array.from(i);
    const a = [0, 1, 2];
    const b = [0, 2, 4];
    const c = [[0, 0], [1, 2], [2, 4]];
    const d = [0, 0, 1, 2, 2, 4];
    const e = [0, 3, 6];

    expect(iterator(a).next().value).to.equal(0);
    expect(array(iterable(() => iterator(a)))).to.deep.equal(a);
    expect(array(map(a, (x) => x * 2))).to.deep.equal(b);
    expect(array(filter(a, (x) => x % 2))).to.deep.equal([1]);
    expect(array(keys({ x: 1, y: 2 }))).to.deep.equal(['x', 'y']);
    expect(array(range(0, 3))).to.deep.equal(a);
    expect(array(singleton(1))).to.deep.equal([1]);
    expect(first(a)).to.deep.equal(0);
    expect(array(take(a, 0))).to.deep.equal([]);
    expect(array(take(a, 2))).to.deep.equal([0, 1]);
    expect(array(take(a, 4))).to.deep.equal(a);
    expect(array(drop(a, 0))).to.deep.equal(a);
    expect(array(drop(a, 1))).to.deep.equal([1, 2]);
    expect(array(drop(a, 3))).to.deep.equal([]);
    expect(length(range(0, 3))).to.equal(3);
    expect(length(array(range(0, 3)))).to.equal(3);
    expect(toArray(range(0, 3))).to.deep.equal(a);
    expect(toArray(a)).to.equal(a);
    expect(array(zip(a, b))).to.deep.equal(c);
    expect(array(join(c))).to.deep.equal(d);
    expect(array(map(c, ([x, y]) => x + y))).to.deep.equal(e);
    expect(reduce(a, (a, x) => a + x, 0)).to.equal(3);
    expect(util.inspect(map(a, (x) => x * 2))).to.equal('(0, 2, 4)');
  });
});

