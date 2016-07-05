// Minimal implementation of various types of dense and sparse matrices

import { iterable } from 'abacus-iterable';

// Marks the end of an iterator
const done = {
  done: true
};

// Create a row-major dense matrix array
export const dense = (n, d, B) => {
  // Optionally reuse the given buffer to store the matrix
  const D = B || new Float64Array(n * d);

  // Return an iterable over the matrix rows
  D[Symbol.iterator] = () => {
    let r = 0;
    return {
      next: () => {
        if(r >= n)
          return done;
        r++;

        // Return an iterable over the matrix columns
        return {
          done: false,
          value: iterable(() => {
            let c = 0;
            return {
              next: () => {
                if(c >= d)
                  return done;
                c++;
                return {
                  done: false,
                  value: D[(r - 1) * d + c - 1]
                };
              }
            };
          })
        };
      }
    };
  };

  // Record the number of rows and columns in the matrix
  if(D.n === undefined) {
    D.n = n;
    D.d = d;
  }

  return D;
};

// Return a cell of a matrix
export const get = (D, r, c) => {
  return D[r * D.d + c];
};

// Set a cell of a matrix
export const set = (D, r, c, val) => {
  D[r * D.d + c] = val;
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

// Convert a row-major dense matrix to a CSR sparse matrix stored in the
// 'old' Yale sparse matrix format.
// See http://cpsc.yale.edu/sites/default/files/files/tr114.pdf
export const toCSR = (D, n, d) => {
  return sparsify(D, 'CSR', n, d, (r, c) => r * d + c);
};

// Convert a row-major dense matrix to a CSC sparse matrix
export const toCSC = (D, n, d) => {
  return sparsify(D, 'CSC', d, n, (c, r) => r * d + c);
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
export const toDense = (sparse, n, d, B) => {
  return sparse.type === 'CSR' ?
    densify(sparse, n, d, (r, c) => r * d + c, B) :
    densify(sparse, d, n, (c, r) => r * d + c, B);
};

// Create a (weight, derivative) matrix
export const dwmatrix = (n, d, w) => {
  const m = dense(n * 2, d);
  const l = n * d;
  if(w)
    m.set(w);
  return {
    n: n,
    d: d,
    w: m.subarray(0, l),
    dw: m.subarray(l, l * 2)
  };
};

// Return gaussian random numbers
let randr = false;
let randv = 0.0;
const randg = () => {
  if(randr) { 
    randr = false;
    return randv; 
  }
  const u = 2 * Math.random() - 1;
  const v = 2 * Math.random() - 1;
  const r = u * u + v * v;
  if(r == 0 || r > 1)
    return randg();

  const c = Math.sqrt(-2 * Math.log(r) / r);
  randv = v * c;
  randr = true;
  return u * c;
};

// Create a row-major dense matrix filled with gaussian random numbers
export const rand = (n, d, mu = 0, std = 0.08) => {
  const m = dense(n, d);
  for(let i = 0, l = n * d; i < l; i++)
    m[i] = mu + randg() * std;
  return m;
};

// Create a (weight, derivative) matrix filled with gaussian random weights
export const dwrand = (n, d, mu = 0, std = 0.08) => {
  const m = dense(n * 2, d);
  for(let i = 0, l = n * d; i < l; i++)
    m[i] = mu + randg() * std;
  return {
    n: n,
    d: d,
    w: m.subarray(0, n * d),
    dw: m.subarray(n * d, n * 2 * d)
  };
};

