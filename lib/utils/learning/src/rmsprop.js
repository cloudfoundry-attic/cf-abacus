// A simple RMSProp gradient descent solver.

import { dwmatrix } from 'abacus-matrix';

/* eslint camelcase: 0 */

// Return a solver
export const solver = () => {
  return {
    decay: 0.999,
    eps: 1e-8,
    cache: {}
  };
};

// Perform parameter update
// Parameter optimization logic initially derived from the recurrentjs
// library (https://github.com/karpathy/recurrentjs)
export const step = (model, solver, lrate, regc, clipval) => {
  /* eslint complexity: [0, 7] */
  const stats = {};
  let nclipped = 0;
  let ntot = 0;

  const cache = solver.cache;
  const decay = solver.decay;
  const eps = solver.eps;

  for(const k of Object.keys(model)) {
    const m = model[k];
    const m_w = m.w;
    if(!m_w)
      continue;
    const m_dw = m.dw;

    // Matrix ref
    let s = cache[k];
    if(!s) {
      s = dwmatrix(m.n, m.d);
      cache[k] = s;
    }
    const s_w = s.w;

    for(let i = 0, n = m_w.length; i < n; i++) {

      // RMSprop adaptive learning rate
      let m_dw_i = m_dw[i];
      s_w[i] = s_w[i] * decay +
        (1.0 - decay) * m_dw_i * m_dw_i;

      // Gradient clip
      if(m_dw_i > clipval) {
        m_dw_i = clipval;
        nclipped++;
      }
      if(m_dw_i < -clipval) {
        m_dw_i = -clipval;
        nclipped++;
      }
      ntot++;

      // Update (and regularize)
      m_w[i] += - lrate * m_dw_i / Math.sqrt(s_w[i] +
          eps) - regc * m_w[i];

      // Reset gradients for next iteration
      m_dw[i] = 0;
    }
  }
  stats.clipped = nclipped * 1.0 / ntot;
  return stats;
};

