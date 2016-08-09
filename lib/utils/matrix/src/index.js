// Minimal implementation of various types of dense and sparse matrices

import { iterable } from 'abacus-iterable';

// Return a pool of numbers of size n, optionally allocated as a subarray
// of a parent pool
export const pool = (n = 0, pp) => {
  // Allocate a new top level pool
  if(!pp)
    return {
      array: new Float64Array(n),
      used: 0
    };

  // Allocate a new pool, overflowing outside of a parent pool
  if(n > pp.array.length - pp.used) {
    const p = {
      array: new Float64Array(n),
      used: 0
    };
    pp.used += n;
    return p;
  }

  // Allocate a new pool as a subarray of a parent pool
  const p = {
    array: pp.array.subarray(pp.used, n),
    used: 0
  };
  pp.used += n;
  return p;
};

// Clear a pool of numbers, allowing it to be reused
export const clear = (p) => {
  if(p.array.length < p.used)
    p.array = new Float64Array(p.used);
  p.used = 0;
};

// Return an array of numbers of size n, optionally allocated from a pool
export const alloc = (n, v, p) => {
  /* eslint complexity: [0, 8] */

  // Allocate a new array, without a pool
  if(!p) {
    const a = new Float64Array(n);
    if(v)
      a.set(v);
    return a;
  }

  // Allocate a new array, overflowing outside of a pool
  if(n > p.array.length - p.used) {
    const a = new Float64Array(n);
    p.used += n;
    if(v)
      a.set(v);
    return a;
  }

  // Allocate a new array inside a pool
  const a = p.array.subarray(p.used, p.used + n);
  p.used += n;
  if(v) {
    a.set(v);
    if(v.length < n)
      a.fill(0.0, v.length);
  }
  else if(v === 0.0)
    a.fill(0.0);
  return a;
};

// Marks the end of an iterator
const done = {
  done: true
};

// Create a row-major dense matrix array
export const dense = (n, d, v, p) => {
  const D = alloc(n * d, v, p);

  // Record the number of rows and columns in the matrix
  D.n = n;
  D.d = d;

  return D;
};

// Convert a dense matrix to an iterable
export const idense = (D) => {
  const n = D.n;
  const d = D.d;

  // Return an iterable over the matrix rows
  const I = {};
  I[Symbol.iterator] = () => {
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
  return I;
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
const densify = (sparse, n1, n2, addr, p) => {
  // Create a dense matrix
  const D = dense(n1, n2, undefined, p);

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
export const toDense = (sparse, n, d, p) => {
  return sparse.type === 'CSR' ?
    densify(sparse, n, d, (r, c) => r * d + c, p) :
    densify(sparse, d, n, (c, r) => r * d + c, p);
};

// Create a (weight, derivative) matrix
export const dwmatrix = (n, d, w, p) => {
  return {
    n: n,
    d: d,
    w: dense(n, d, w, p),
    dw: dense(n, d, 0.0, p)
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
export const rand = (n, d, p, mu = 0, std = 0.08) => {
  const m = dense(n, d, undefined, p);
  for(let i = 0, l = n * d; i < l; i++)
    m[i] = mu + randg() * std;
  return m;
};

// Create a (weight, derivative) matrix filled with gaussian random weights
export const dwrand = (n, d, p, mu = 0, std = 0.08) => {
  const w = dense(n, d, undefined, p);
  for(let i = 0, l = n * d; i < l; i++)
    w[i] = mu + randg() * std;
  return {
    n: n,
    d: d,
    w: w,
    dw: dense(n, d, 0.0, p)
  };
};

