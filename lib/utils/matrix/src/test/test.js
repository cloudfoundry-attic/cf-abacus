// Minimal implementation of dense matrices and CSR sparse matrices

import { forEach } from 'abacus-iterable';
import * as matrix from '..';

describe('abacus-matrix', () => {
  const array = [
    0.0, 0.0, 0.0, 0.0,
    5.0, 8.0, 0.0, 0.0,
    0.0, 0.0, 3.0, 0.0,
    0.0, 6.0, 0.0, 0.0
  ];

  const csr = {
    type: 'CSR',
    A: [5.0, 8.0, 3.0, 6.0],
    JA: [0, 1, 2, 1],
    IA: [0, 0, 2, 3, 4]
  };

  const csc = {
    type: 'CSC',
    A: [5.0, 8.0, 6.0, 3.0],
    JA: [1, 1, 3, 2],
    IA: [0, 1, 3, 4, 4]
  };

  it('implements iterable and mutable dense matrices', () => {
    const dense = matrix.dense(4, 4);
    dense.set(array);
    const a = new Array();
    forEach(matrix.idense(dense), (row, r) => {
      forEach(row, (value, c) => {
        a.push(value);
      });
    });
    expect(a).to.deep.equal(array);

    const random = Math.random;
    let r = 0;
    Math.random = () => r += 0.01;

    const rm = matrix.rand(4, 4);
    expect(rm[0]).to.equal(-0.01792133842613031);
    expect(rm[1]).to.equal(-0.01740930018538373);
    expect(rm[2]).to.equal(-0.03330879516565767);

    Math.random = random;
  });

  it('allocates matrices from pools of arrays of numbers', () => {
    const pool = matrix.pool();
    expect(pool.used).to.equal(0);

    const m1 = matrix.dense(4, 4, 0.0, pool);
    const m2 = matrix.dense(4, 4, 0.0, pool);
    m1.set(array);
    expect(m1[5]).to.equal(8.0);
    expect(pool.used).to.equal(m1.length + m2.length);

    matrix.clear(pool);
    expect(pool.array.length).to.equal(m1.length + m2.length);
    expect(pool.used).to.equal(0);

    const m3 = matrix.dense(4, 4, 0.0, pool);
    const m4 = matrix.dense(4, 4, 0.0, pool);
    expect(pool.used).to.equal(m3.length + m4.length);
    expect(pool.array.length).to.equal(m3.length + m4.length);
    expect(m3[5]).to.equal(0.0);

    matrix.clear(pool);
    const m5 = matrix.dense(4, 4, 0.0, pool);
    const m6 = matrix.dense(4, 4, 0.0, pool);
    m5.set(array);
    m6.set(array);
    expect(m5[5]).to.equal(8.0);
    expect(m6[5]).to.equal(8.0);
    expect(m3[5]).to.equal(8.0);
    expect(m4[5]).to.equal(8.0);

    const m7 = matrix.dense(2, 2, 0.0, pool);
    expect(pool.array.length).to.equal(m5.length + m6.length);
    expect(pool.used).to.equal(m5.length + m6.length + m7.length);
    matrix.clear(pool);
    expect(pool.array.length).to.equal(m5.length + m6.length + m7.length);
  });

  it('supports addressing individual matrix cells', () => {
    const dense = matrix.dense(4, 4);
    dense.set(array);
    matrix.set(dense, 1, 1, 4.0);
    expect(dense[5]).to.equal(4.0);
    expect(matrix.get(dense, 1, 0)).to.equal(5.0);
  });

  it('converts a dense matrix array to a CSR sparse matrix', () => {
    const dense = matrix.dense(4, 4);
    dense.set(array);
    expect(matrix.toCSR(dense, 4, 4)).to.deep.equal(csr);
  });

  it('converts a CSR sparse matrix to a dense matrix array', () => {
    const dense = matrix.dense(4, 4);
    dense.set(array);
    expect(
      matrix.toDense(csr, 4, 4)).to.deep.equal(dense);
  });

  it('converts a dense matrix array to a CSC sparse matrix', () => {
    const dense = matrix.dense(4, 4);
    dense.set(array);
    expect(matrix.toCSC(dense, 4, 4)).to.deep.equal(csc);
  });

  it('converts a CSC sparse matrix to a dense matrix array', () => {
    const dense = matrix.dense(4, 4);
    dense.set(array);
    expect(
      matrix.toDense(csc, 4, 4)).to.deep.equal(dense);
  });

  it('implements (weight, derivative) matrices', () => {
    const dm = matrix.dwmatrix(4, 4);
    expect(dm.w[0]).to.equal(0);
    expect(dm.dw[0]).to.equal(0);

    const random = Math.random;
    let r = 0;
    Math.random = () => r += 0.01;

    const rm = matrix.dwrand(4, 4);
    expect(rm.w[0]).to.equal(-0.01792133842613031);
    expect(rm.w[1]).to.equal(-0.01740930018538373);
    expect(rm.w[2]).to.equal(-0.03330879516565767);
    expect(rm.dw[0]).to.equal(0);

    Math.random = random;
  });

});

