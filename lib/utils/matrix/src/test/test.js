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

  it('supports iteration over the rows and columns of a matrix', () => {
    const dense = matrix.dense(4, 4);
    dense.set(array);
    const a = new Array();
    forEach(dense, (row, r) => {
      forEach(row, (value, c) => {
        a.push(value);
      });
    });
    expect(a).to.deep.equal(array);
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
});

