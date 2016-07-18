// A very basic neural network, used to test the rest of this library.

import { dwmatrix, dwrand } from 'abacus-matrix';
import { rowPluck, mul, add, leakyrelu, tanh } from './compgraph';

/* eslint dot-notation: 0 */

// Return a new basic neural network
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
    net['bh' + d] = dwmatrix(hsize, 1);
  }

  // Hidden to output
  net['Why'] = dwrand(osize, hsize);

  // Output bias
  net['by'] = dwmatrix(osize, 1);

  return net;
};

// Forward feed the network. Net contains the network parameters, G is
// the graph to append computations to, ix is a 1D column vector with
// the input observation.
export const forward = (net, G, ix) => {
  // Pluck the input embedding vector
  const x = rowPluck(G, net['Wix'], ix);

  // Loop over the hidden layers
  const hsizes = net.hsizes;
  const h = [];
  for(let d = 0; d < hsizes.length; d++) {
    const ivector = d === 0 ? x : h[d - 1];

    // Multiply input by the weights followed by bias offset and
    // a leaky reLU non-linearity
    const h0 = mul(G, net['Wxh' + d], ivector);
    const hd = leakyrelu(G, add(G, h0, net['bh' + d]));

    h.push(hd);
  }

  // Decode output using a bias offset and a tanh non-linearity
  const o = tanh(G,
    add(G, mul(G, net['Why'], h[h.length - 1]), net['by']));

  return [o];
};

