// Simple computation graphs with automatic differentiation. Nothing
// comparable to real computation engines like Torch, Theano, etc but
// enough to run toy unit tests like the Abacus usage anomaly detection
// for example without too much overhead.

// Note the variable aliases and the loop unrolling, just there to keep
// most of the code out of the loops

// Matrix ops and differentiation logic initially derived from the
// recurrentjs library (https://github.com/karpathy/recurrentjs)

import assert from 'assert';
import { dwmatrix } from 'abacus-matrix';

/* eslint camelcase: 0 */

// Return a computation graph
export const graph = (pool, backprop = true) => {
  return {
    pool: pool,
    // Store a list of backward operations that will perform backprop
    // in their forward pass order
    backprop: backprop,
    backward: []
  };
};

// Invoke all the backward operations
export const backward = (G) => {
  for(let i = G.backward.length - 1; i >= 0; i--)
    G.backward[i]();
};

// Pluck a row of m with index ix and return it as col vector
const back_rowPluck = (m, ix, out) => {
  const m_d = m.d;
  const d_ix = m_d * ix;
  const m_dw = m.dw;
  const out_dw = out.dw;
  for(let i = 0; i < m_d; i++)
    m_dw[d_ix + i] += out_dw[i];
};

export const rowPluck = (G, m, ix) => {
  if(typeof ix === 'object')
    // Noop if the input is an input embedding
    return dwmatrix(m.d, 1, ix);

  assert(ix >= 0 && ix < m.n, 'rowPluck invalid row index');
  const m_d = m.d;
  const out = dwmatrix(m_d, 1, undefined, G.pool);

  // Copy over the data
  const d_ix = m_d * ix;
  const out_w = out.w;
  const m_w = m.w;
  for(let i = 0; i < m_d; i++)
    out_w[i] = m_w[d_ix + i];

  if(G.backprop)
    G.backward.push(() => back_rowPluck(m, ix, out));
  return out;
};

// Tanh nonlinearity
const back_tanh = (m, out) => {
  // Grad for z = tanh(x) is (1 - z^2)
  const w_l = m.w.length;
  const m_dw = m.dw;
  const out_w = out.w;
  const out_dw = out.dw;
  for(let i = 0; i < w_l; i++) {
    const out_w_i = out_w[i];
    m_dw[i] += (1.0 - out_w_i * out_w_i) * out_dw[i];
  }
};

export const tanh = (G, m) => {
  const out = dwmatrix(m.n, m.d, undefined, G.pool);
  const m_l = m.w.length;
  
  const out_w = out.w;
  const m_w = m.w;
  for(let i = 0; i < m_l; i++)
    out_w[i] = Math.tanh(m_w[i]);

  if(G.backprop)
    G.backward.push(() => back_tanh(m, out));
  return out;
};

// Sigmoid nonlinearity
const back_sigmoid = (m, out) => {
  const m_l = m.w.length;
  const out_w = out.w;
  const m_dw = m.dw;
  const out_dw = out.dw;
  for(let i = 0; i < m_l; i++) {
    const out_w_i = out_w[i];
    m_dw[i] += out_w_i * (1.0 - out_w_i) * out_dw[i];
  }
};

export const sigmoid = (G, m) => {
  const out = dwmatrix(m.n, m.d, undefined, G.pool);

  const m_l = m.w.length;
  const out_w = out.w;
  const m_w = m.w;
  for(let i = 0; i < m_l; i++)
    out_w[i] = 1.0 / (1 + Math.exp(-m_w[i]));

  if(G.backprop)
    G.backward.push(() => back_sigmoid(m, out));
  return out;
};

// Rectified linear unit (ReLU)
const back_relu = (m, out) => {
  const m_l = m.w.length;
  const m_dw = m.dw;
  const m_w = m.w;
  const out_dw = out.dw;
  for(let i = 0; i < m_l; i++)
    m_dw[i] += m_w[i] > 0.0 ? out_dw[i] : 0.0;
};

export const relu = (G, m) => {
  const out = dwmatrix(m.n, m.d, undefined, G.pool);

  const m_l = m.w.length;
  const out_w = out.w;
  const m_w = m.w;
  for(let i = 0; i < m_l; i++)
    out_w[i] = m_w[i] > 0.0 ? m_w[i] : 0.0;

  if(G.backprop)
    G.backward.push(() => back_relu(m, out));
  return out;
};

// Leaky rectified linear unit (leaky ReLU)
const back_leakyrelu = (m, out) => {
  const m_l = m.w.length;
  const m_dw = m.dw;
  const m_w = m.w;
  const out_dw = out.dw;
  for(let i = 0; i < m_l; i++)
    m_dw[i] += (m_w[i] > 0 ? out_dw[i] : 0.0) +
      0.01 * (m_w[i] < 0.0 ? m_dw[i] : 0.0);
};

export const leakyrelu = (G, m) => {
  const out = dwmatrix(m.n, m.d, undefined, G.pool);

  const m_l = m.w.length;
  const out_w = out.w;
  const m_w = m.w;
  for(let i = 0; i < m_l; i++)
    out_w[i] = (m_w[i] > 0.0 ? m_w[i] : 0.0) +
      0.01 * (m_w[i] < 0.0 ? m_w[i] : 0.0);

  if(G.backprop)
    G.backward.push(() => back_leakyrelu(m, out));
  return out;
};

// Matrix multiplication
const back_mul = (m1, m2, out) => {
  /* eslint complexity: [0, 13] */
  const m1_n = m1.n;
  const m2_d = m2.d;
  const m1_w = m1.w;
  const m1_dw = m1.dw;
  const m2_w = m2.w;
  const m2_dw = m2.dw;
  const m1_d = m1.d;
  const out_dw = out.dw;
  const m1_d_8 = Math.floor(m1_d / 8) * 8;
  const m2_d_2 = m2_d + m2_d;
  const m2_d_3 = m2_d_2 + m2_d;
  const m2_d_4 = m2_d_3 + m2_d;
  const m2_d_5 = m2_d_4 + m2_d;
  const m2_d_6 = m2_d_5 + m2_d;
  const m2_d_7 = m2_d_6 + m2_d;
  const m2_d_8 = m2_d_7 + m2_d;

  // Loop over rows of m1
  for(let i = 0, m1_d_i = 0, m2_d_i = 0;
    i < m1_n;
    i++, m1_d_i += m1_d, m2_d_i += m2_d)
    // Loop over cols of m2
    for(let j = 0, m2_d_i_j = m2_d_i; j < m2_d; j++, m2_d_i_j++) {

      // Dot product loop
      // const m2_d_i_j = m2_d * i + j
      const b = out_dw[m2_d_i_j];

      // Unroll the loop by processing batches of 8 entries at a time
      let k = 0, m1_d_i_k = m1_d_i, m2_d_k_j = j;
      for(;
        k < m1_d_8;
        k += 8, m1_d_i_k += 8, m2_d_k_j += m2_d_8) {
        // const m1_d_i_k = m1.d * i + k;
        // const m2_d_k_j = m2.d * k + j;
        m1_dw[m1_d_i_k] += m2_w[m2_d_k_j] * b;
        m2_dw[m2_d_k_j] += m1_w[m1_d_i_k] * b;
        m1_dw[m1_d_i_k + 1] += m2_w[m2_d_k_j + m2_d] * b;
        m2_dw[m2_d_k_j + m2_d] += m1_w[m1_d_i_k + 1] * b;
        m1_dw[m1_d_i_k + 2] += m2_w[m2_d_k_j + m2_d_2] * b;
        m2_dw[m2_d_k_j + m2_d_2] += m1_w[m1_d_i_k + 2] * b;
        m1_dw[m1_d_i_k + 3] += m2_w[m2_d_k_j + m2_d_3] * b;
        m2_dw[m2_d_k_j + m2_d_3] += m1_w[m1_d_i_k + 3] * b;
        m1_dw[m1_d_i_k + 4] += m2_w[m2_d_k_j + m2_d_4] * b;
        m2_dw[m2_d_k_j + m2_d_4] += m1_w[m1_d_i_k + 4] * b;
        m1_dw[m1_d_i_k + 5] += m2_w[m2_d_k_j + m2_d_5] * b;
        m2_dw[m2_d_k_j + m2_d_5] += m1_w[m1_d_i_k + 5] * b;
        m1_dw[m1_d_i_k + 6] += m2_w[m2_d_k_j + m2_d_6] * b;
        m2_dw[m2_d_k_j + m2_d_6] += m1_w[m1_d_i_k + 6] * b;
        m1_dw[m1_d_i_k + 7] += m2_w[m2_d_k_j + m2_d_7] * b;
        m2_dw[m2_d_k_j + m2_d_7] += m1_w[m1_d_i_k + 7] * b;
      }

      // Process the last batch
      for(;
        k < m1_d;
        k++, m1_d_i_k++, m2_d_k_j += m2_d) {
        // const m1_d_i_k = m1.d * i + k;
        // const m2_d_k_j = m2.d * k + j;
        m1_dw[m1_d_i_k] += m2_w[m2_d_k_j] * b;
        m2_dw[m2_d_k_j] += m1_w[m1_d_i_k] * b;
      }
    }
};

export const mul = (G, m1, m2) => {
  /* eslint complexity: [0, 11] */
  assert(m1.d === m2.n, 'mul dimensions misaligned');
  const out = dwmatrix(m1.n, m2.d, undefined, G.pool);

  const m1_n = m1.n;
  const m2_d = m2.d;
  const m1_d = m1.d;
  const m1_w = m1.w;
  const m2_w = m2.w;
  const out_w = out.w;
  const m1_d_8 = Math.floor(m1_d / 8) * 8;
  const m2_d_2 = m2_d + m2_d;
  const m2_d_3 = m2_d_2 + m2_d;
  const m2_d_4 = m2_d_3 + m2_d;
  const m2_d_5 = m2_d_4 + m2_d;
  const m2_d_6 = m2_d_5 + m2_d;
  const m2_d_7 = m2_d_6 + m2_d;
  const m2_d_8 = m2_d_7 + m2_d;

  // Loop over rows of m1
  for(let i = 0, m1_d_i = 0, m2_d_i = 0;
    i < m1_n; i++,
    m1_d_i += m1_d, m2_d_i += m2_d)
    // Loop over cols of m2
    for(let j = 0, m2_d_i_j = m2_d_i; j < m2_d; j++, m2_d_i_j++) {
      // Dot product loop
      let dot = 0.0;

      // Unroll the loop by processing batches of 8 entries at a time
      let k = 0, m1_d_i_k = m1_d_i, m2_d_k_j = j;
      for(;
        k < m1_d_8;
        k += 8, m1_d_i_k += 8, m2_d_k_j += m2_d_8)
        // const m1_d_i_k = m1.d * i + k;
        // const m2_d_k_j = m2.d * k + j;
        dot += m1_w[m1_d_i_k] * m2_w[m2_d_k_j] +
          m1_w[m1_d_i_k + 1] * m2_w[m2_d_k_j + m2_d] +
          m1_w[m1_d_i_k + 2] * m2_w[m2_d_k_j + m2_d_2] +
          m1_w[m1_d_i_k + 3] * m2_w[m2_d_k_j + m2_d_3] +
          m1_w[m1_d_i_k + 4] * m2_w[m2_d_k_j + m2_d_4] +
          m1_w[m1_d_i_k + 5] * m2_w[m2_d_k_j + m2_d_5] +
          m1_w[m1_d_i_k + 6] * m2_w[m2_d_k_j + m2_d_6] +
          m1_w[m1_d_i_k + 7] * m2_w[m2_d_k_j + m2_d_7];

      // Process the last batch
      for(;
        k < m1_d;
        k++, m1_d_i_k++, m2_d_k_j += m2_d)
        // const m1_d_i_k = m1.d * i + k;
        // const m2_d_k_j = m2.d * k + j;
        dot += m1_w[m1_d_i_k] * m2_w[m2_d_k_j];

      // const m2_d_i_j = m2_d * i + j;
      out_w[m2_d_i_j] = dot;
    }

  if(G.backprop)
    G.backward.push(() => back_mul(m1, m2, out));
  return out;
};

// Element-wise summation
const back_add = (m1, m2, out) => {
  const m1_l = m1.w.length;
  const m1_dw = m1.dw;
  const out_dw = out.dw;
  const m2_dw = m2.dw;
  for(let i = 0; i < m1_l; i++) {
    m1_dw[i] += out_dw[i];
    m2_dw[i] += out_dw[i];
  }
};

export const add = (G, m1, m2) => {
  assert(m1.w.length === m2.w.length, 'add dimensions misaligned');
  const out = dwmatrix(m1.n, m1.d, undefined, G.pool);

  const m1_l = m1.w.length;
  const out_w = out.w;
  const m1_w = m1.w;
  const m2_w = m2.w;
  for(let i = 0; i < m1_l; i++)
    out_w[i] = m1_w[i] + m2_w[i];

  if(G.backprop)
    G.backward.push(() => back_add(m1, m2, out));
  return out;
};

// Dot product
const back_dot = (m1, m2, out) => {
  const m1_l = m1.w.length;
  const out_dw_0 = out.dw[0];
  const m1_dw = m1.dw;
  const m1_w = m1.w;
  const m2_dw = m2.dw;
  const m2_w = m2.w;
  for(let i = 0; i < m1_l; i++) {
    m1_dw[i] += m2_w[i] * out_dw_0;
    m2_dw[i] += m1_w[i] * out_dw_0;
  }
};

export const dot = (G, m1, m2) => {
  // m1 and m2 are both column vectors
  const out = dwmatrix(1, 1, undefined, G.pool);

  const m1_l = m1.w.length;
  const m1_w = m1.w;
  const m2_w = m2.w;
  let dot = 0.0;
  for(let i = 0; i < m1_l; i++)
    dot += m1_w[i] * m2_w[i];
  out.w[0] = dot;

  if(G.backprop)
    G.backward.push(() => back_dot(m1, m2, out));
  return out;
};

// Element-wise Hadamard product
const back_eltmul = (m1, m2, out) => {
  const m1_l = m1.w.length;
  const m1_dw = m1.dw;
  const m1_w = m1.w;
  const m2_dw = m2.dw;
  const m2_w = m2.w;
  for(let i = 0; i < m1_l; i++) {
    const out_dw_i = out.dw[i];
    m1_dw[i] += m2_w[i] * out_dw_i;
    m2_dw[i] += m1_w[i] * out_dw_i;
  }
};

export const eltmul = (G, m1, m2) => {
  assert(m1.w.length === m2.w.length, 'eltmul dimensions misaligned');
  const out = dwmatrix(m1.n, m1.d, undefined, G.pool);

  const m1_l = m1.w.length;
  const out_w = out.w;
  const m1_w = m1.w;
  const m2_w = m2.w;
  for(let i = 0; i < m1_l; i++)
    out_w[i] = m1_w[i] * m2_w[i];

  if(G.backprop)
    G.backward.push(() => back_eltmul(m1, m2, out));
  return out;
};

// Softmax classification
export const softmax = (G, m) => {
  // Probability volume
  const out = dwmatrix(m.n, m.d, undefined, G.pool);

  let maxval = -999999;
  for(let i = 0, n = m.w.length; i < n; i++)
    if(m.w[i] > maxval)
      maxval = m.w[i];

  let s = 0.0;
  for(let i = 0, n = m.w.length; i < n; i++) { 
    out.w[i] = Math.exp(m.w[i] - maxval);
    s += out.w[i];
  }
  for(let i = 0, n = m.w.length; i < n; i++)
    out.w[i] /= s;

  // No backward pass needed here since we can just use the computed
  // probabilities to set gradients directly on m
  return out;
};

