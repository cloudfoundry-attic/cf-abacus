// A minimal recurrent neural network. Useful to evaluate the detection
// of anomalies in usage pattern sequences.

import { dwmatrix, dwrand } from 'abacus-matrix';
import { rowPluck, mul, leakyrelu, add } from './compgraph';

/* eslint camelcase: 1 */
/* eslint dot-notation: 0 */

// Return a new recurrent network
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

    net['Wxh' + d] = dwrand(hsize, psize);
    net['Whh' + d] = dwrand(hsize, hsize);
    net['bhh' + d] = dwmatrix(hsize, 1);
  }

  // Decoder params
  net['Whd'] = dwrand(osize, hsize);
  net['bd'] = dwmatrix(osize, 1);
  return net;
};

// Forward feed the network. Net contains the network parameters, G is
// the graph to append computations to, ix is a 1D column vector with
// the input observation, and state is a struct containing hidden
// activations from the previous iteration.
export const forward = (net, G, ix, state) => {
  // Pluck the input embedding vector
  const x = rowPluck(G, net['Wix'], ix);

  const hsizes = net.hsizes;

  let hstates;
  if(!state || typeof state.h === 'undefined') {
    hstates = [];
    for(let d = 0; d < hsizes.length; d++)
      hstates.push(dwmatrix(hsizes[d], 1)); 
  }
  else
    hstates = state.h;

  // Loop over the hidden layers
  const h = [];
  for(let d = 0; d < hsizes.length; d++) {
    const ivector = d === 0 ? x : h[d - 1];
    const hstate = hstates[d];

    const h0 = mul(G, net['Wxh' + d], ivector);
    const h1 = mul(G, net['Whh' + d], hstate);
    const hd = leakyrelu(G, add(G, add(G, h0, h1), net['bhh' + d]));

    h.push(hd);
  }

  // One decoder to outputs at the end
  const output = add(G, mul(G, net['Whd'], h[h.length - 1]), net['bd']);

  // Return output and the new state containing hidden activations
  return [output, { h: h }];
};

