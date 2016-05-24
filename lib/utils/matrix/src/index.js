// Minimal implementation of dense matrices and CSR sparse matrices stored
// in the 'old' Yale sparse matrix format
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

// Convert a row-major dense matrix to a CSR sparse matrix
export const toCSR = (D, nrows, ncolumns) => {
  const A = [];
  const JA = [];
  const IA = [];
  for(let r = 0; r < nrows; r++) {
    // Store the index in A of the first zon-zero element of the row
    IA.push(A.length);
    for(let c = 0; c < ncolumns; c++) {
      const i = r * ncolumns + c;
      if(D[i] !== 0.0) {
        // Add non-zero element to A
        A.push(D[i]);
        // Add its index to JA
        JA.push(c);
      }
    }
  }
  IA.push(A.length);

  // Return the CSR sparse matrix
  const S = {
    A: A,
    JA: JA,
    IA: IA
  };
  return S;
};

// Convert a CSR matrix into a row-major dense matrix
export const toDense = (csr, nrows, ncolumns, B) => {
  // Create a dense matrix
  const D = dense(nrows, ncolumns, B);

  // Load the dense matrix with the contents of the given CSR matrix
  const A = csr.A;
  const JA = csr.JA;
  const IA = csr.IA;
  for(let r = 0; r < nrows; r++) {
    for(let c = 0; c < ncolumns; c++) {
      const i = r * ncolumns + c;
      D[i] = 0.0;
    }
    for(let a = IA[r]; a < IA[r + 1]; a++) {
      const i = r * ncolumns + JA[a];
      D[i] = A[a];
    }
  }

  return D;
};

