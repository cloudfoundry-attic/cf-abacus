// Minimal implementation of dense matrices and CSR and CSC sparse matrices
// stored in the 'old' Yale sparse matrix format
// See http://cpsc.yale.edu/sites/default/files/files/tr114.pdf

import { iterable } from 'abacus-iterable';

// Marks the end of an iterator
const done = {
  done: true
};

// Create a row-major dense matrix array
export const dense = (nrows, ncolumns, B) => {
  // Optionally reuse the given buffer to store the matrix
  const D = B || new Float64Array(nrows * ncolumns);

  // Return an iterable over the matrix rows
  D[Symbol.iterator] = () => {
    let r = 0;
    return {
      next: () => {
        if(r >= nrows)
          return done;
        r++;

        // Return an iterable over the matrix columns
        return {
          done: false,
          value: iterable(() => {
            let c = 0;
            return {
              next: () => {
                if(c >= ncolumns)
                  return done;
                c++;
                return {
                  done: false,
                  value: D[(r - 1) * ncolumns + c - 1]
                };
              }
            };
          })
        };
      }
    };
  };

  // Set a cell of a matrix
  const set = D.set;
  Object.defineProperty(D, 'set', {
    enumerable: false,
    value: function(r, c, val) {
      if(arguments.length !== 3)
        set.apply(this, arguments);
      else
        this[r * ncolumns + c] = val;
    }
  });

  // Return a cell of a matrix
  Object.defineProperty(D, 'get', {
    enumerable: false,
    value: function(r, c) {
      return this[r * ncolumns + c];
    }
  });

  return D;
};

// Convert a dense matrix to a sparse matrix
const sparsify = (D, type, n1, n2, addr) => {
  const A = [];
  const JA = [];
  const IA = [];
  for(let i1 = 0; i1 < n1; i1++) {
    // Store the index in A of the first zon-zero element of the first
    // dimension
    IA.push(A.length);
    for(let i2 = 0; i2 < n2; i2++) {
      const i = addr(i1, i2);
      if(D[i] !== 0.0) {
        // Add non-zero element to A
        A.push(D[i]);
        // Add its index to JA
        JA.push(i2);
      }
    }
  }
  IA.push(A.length);

  // Return the sparse matrix
  const S = {
    type: type,
    A: A,
    JA: JA,
    IA: IA
  };
  return S;
};

// Convert a row-major dense matrix to a CSR sparse matrix
export const toCSR = (D, nrows, ncolumns) => {
  return sparsify(D, 'CSR', nrows, ncolumns, (r, c) => r * ncolumns + c);
};

// Convert a row-major dense matrix to a CSC sparse matrix
export const toCSC = (D, nrows, ncolumns) => {
  return sparsify(D, 'CSC', ncolumns, nrows, (c, r) => r * ncolumns + c);
};

// Load a sparse matrix into a row-major dense matrix
const densify = (sparse, n1, n2, addr, B) => {
  // Create a dense matrix
  const D = dense(n1, n2, B);

  // Load the contents of the sparse matrix into the dense matrix
  const A = sparse.A;
  const JA = sparse.JA;
  const IA = sparse.IA;

  for(let i1 = 0; i1 < n1; i1++) {
    for(let i2 = 0; i2 < n2; i2++) {
      const i = addr(i1, i2);
      D[i] = 0.0;
    }
    for(let a = IA[i1]; a < IA[i1 + 1]; a++) {
      const i = addr(i1, JA[a]);
      D[i] = A[a];
    }
  }

  return D;
};

// Load a CSR or CSC sparse matrix into a row-major dense matrix
export const toDense = (sparse, nrows, ncolumns, B) => {
  return sparse.type === 'CSR' ?
    densify(sparse, nrows, ncolumns, (r, c) => r * ncolumns + c, B) :
    densify(sparse, ncolumns, nrows, (c, r) => r * ncolumns + c, B);
};

