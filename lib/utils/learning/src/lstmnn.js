// A minimal Long Short-Term Memory (LSTM) neural network. Useful to
// evaluate the detection of anomalies in usage pattern sequences.

import { dwmatrix, dwrand } from 'abacus-matrix';
import { rowPluck, mul, tanh, sigmoid, add, eltmul } from './compgraph';

/* eslint dot-notation: 0 */

// Return a new LSTM network
// Network configuration initially derived from the recurrentjs library
// (https://github.com/karpathy/recurrentjs)
export const network = (isize, esize, hsizes, osize) => {
  // The embedding layer is optional, allowing the caller to forward the
  // embeddings directly
  if(osize === undefined)
    return network(0, isize, esize, hsizes);

  const net = {
    isize: isize,
    esize: esize,
    hsizes: hsizes,
    osize: osize
  };

  // Input embedding vectors
  net['Wix'] = dwrand(isize, esize);

  // Loop over hidden layers
  let hsize;
  for(let d = 0; d < hsizes.length; d++) {
    const psize = d === 0 ? esize : hsizes[d - 1];
    hsize = hsizes[d];

    // Gates parameters
    net['Wix' + d] = dwrand(hsize, psize);  
    net['Wih' + d] = dwrand(hsize, hsize);
    net['bi' + d] = dwmatrix(hsize, 1);
    net['Wfx' + d] = dwrand(hsize, psize);  
    net['Wfh' + d] = dwrand(hsize, hsize);
    net['bf' + d] = dwmatrix(hsize, 1);
    net['Wox' + d] = dwrand(hsize, psize);  
    net['Woh' + d] = dwrand(hsize, hsize);
    net['bo' + d] = dwmatrix(hsize, 1);

    // Cell write params
    net['Wcx' + d] = dwrand(hsize, psize);  
    net['Wch' + d] = dwrand(hsize, hsize);
    net['bc' + d] = dwmatrix(hsize, 1);
  }

  // Decoder params
  net['Whd'] = dwrand(osize, hsize);
  net['bd'] = dwmatrix(osize, 1);
  return net;
};

// Forward feed the network. Net contains the network parameters, G is the
// graph to append computations to, ix is a 1D column vector with the
// input observation, and state is a struct containing hidden activations
// and cell from the previous iteration.
export const forward = (net, G, ix, state) => {
  // Pluck the input embedding vector
  const x = rowPluck(G, net['Wix'], ix);

  const hsizes = net.hsizes;

  let hstates;
  let cstates;
  if(!state || typeof state.h === 'undefined') {
    hstates = [];
    cstates = [];
    for(let d = 0; d < hsizes.length; d++) {
      hstates.push(dwmatrix(hsizes[d], 1)); 
      cstates.push(dwmatrix(hsizes[d], 1)); 
    }
  }
  else {
    hstates = state.h;
    cstates = state.c;
  }

  // Loop over the hidden layers
  const h = [];
  const c = [];
  for(let d = 0; d < hsizes.length; d++) {
    const ivector = d === 0 ? x : h[d - 1];
    const hstate = hstates[d];
    const cstate = cstates[d];

    // Input gate
    const h0 = mul(G, net['Wix' + d], ivector);
    const h1 = mul(G, net['Wih' + d], hstate);
    const igate = sigmoid(G, add(G, add(G, h0, h1), net['bi' + d]));

    // Forget gate
    const h2 = mul(G, net['Wfx' + d], ivector);
    const h3 = mul(G, net['Wfh' + d], hstate);
    const fgate = sigmoid(G, add(G, add(G, h2, h3), net['bf' + d]));

    // Output gate
    const h4 = mul(G, net['Wox' + d], ivector);
    const h5 = mul(G, net['Woh' + d], hstate);
    const ogate = sigmoid(G, add(G, add(G, h4, h5), net['bo' + d]));

    // Write operation on cells
    const h6 = mul(G, net['Wcx' + d], ivector);
    const h7 = mul(G, net['Wch' + d], hstate);
    const cwrite = tanh(G, add(G, add(G, h6, h7), net['bc' + d]));

    // Compute new cell activation
    // What do we keep from cell
    const retain = eltmul(G, fgate, cstate);
    // What do we write to cell
    const write = eltmul(G, igate, cwrite);
    // New cell contents
    const cd = add(G, retain, write);

    // Compute hidden state as gated, saturated cell activations
    const hd = eltmul(G, ogate, tanh(G, cd));

    h.push(hd);
    c.push(cd);
  }

  // One decoder to outputs at the end
  const output = add(G, mul(G, net['Whd'], h[h.length - 1]), net['bd']);

  // Return output and the new state containing hidden activations and
  // cell memory
  return [output, { h: h, c: c }];
};

