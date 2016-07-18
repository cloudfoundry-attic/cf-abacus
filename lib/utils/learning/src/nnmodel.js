// A minimal neural network classifier model

// API loosely inspired by the Python scikit-learn Classifier API
// (see http://scikit-learn.org/stable/modules/classes.html)

import { map, forEach, zip, toArray } from 'abacus-iterable';
import { pool, clear } from 'abacus-matrix';
import { graph, backward, softmax } from './compgraph';
import * as rmsprop from './rmsprop';
import { argmax, median } from './utils';
import debug from 'abacus-debug';

// Setup debug log
const log = debug('abacus-learning');

// Return a neural network model
export const model = (network, forward,
  epochs = 5, lrate = 0.01, regs = 0.000001, clip = 5.0) => {

  const m = {
    // Number of training epochs
    epochs: epochs,

    // Number of samples seen
    samples: 0,

    // Learning rate, regularization strength, and clip gradient
    lrate: lrate,
    regs: regs,
    clip: clip,

    // Neural network
    network: network,
    forward: forward,

    // Number pool
    pool: pool(),

    // Solver
    solver: rmsprop.solver()
  };

  // Customize JSON format
  m.toJSON = () => ({
    epochs: m.epochs,
    samples: m.samples,
    lrate: lrate,
    regs: regs,
    clip: clip,
    network: m.network.toJSON()
  });

  return m;
};

// Train a model with a batch of featureset samples X and the corresponding
// target labels Y
export const fit = (model, X, Y) => {
  let s = model.samples;

  // Keep track of perplexity, cost and solver clip gradients throughout
  // the training epochs
  let ppls = [];
  let costs = [];
  let clips = [];

  // Clear the number pool
  clear(model.pool);

  // Run the configured number of training epochs
  const T = toArray(zip(X, Y));
  for(let e = 0, n = model.epochs; e < n; e++) {
    if((e + 1) % 10 === 0)
      log('Training epoch %d', e + 1);

    let state = {};
    let cost = 0.0;
    let log2ppl = 0.0;
    forEach(T, ([x, y]) => {
      // Create a computation graph
      const G = graph(model.pool);

      // Feed forward the network and interpret output as log probabilities
      const [logprobs, nstate] = model.forward(model.network, G, x, state);

      // Remember the state of the network's hidden activations, as we'll
      // feed it back into it on the next forward feed
      state = nstate;

      // Compute softmax probabilities
      const probs = softmax(G, logprobs);

      // Accumulate base 2 log prob and do smoothing
      log2ppl += -Math.log2(probs.w[y]);
      cost += -Math.log(probs.w[y]);

      // Write gradients into log probabilities. Cross-entropy loss for
      // softmax is simply the probabilities themselves.
      logprobs.dw = probs.w;

      // The target label gets an extra -1
      logprobs.dw[y] -= 1;

      // Propagate gradients backwards through the graph, setting the
      // .dw field with the gradients
      backward(G);

      s++;
    });

    // Record the cost and the average per-sample perplexity for the
    // training set batch in each epoch
    ppls.push(Math.pow(2, log2ppl / T.length));
    costs.push(cost);

    // Do a parameter update using RMSProp gradient descent
    const stats = rmsprop.step(
      model.network, model.solver, model.lrate, model.regs, model.clip);
    clips.push(stats.clipped);

    if((e + 1) % 10 === 0) {
      log('Trained with %d samples', s);
      log('Median cost: ', median(costs).toFixed(2));
      log('Median perplexity: ', median(ppls).toFixed(2));
      log('Median clip gradient: ', median(clips).toFixed(2));
      ppls = [];
      costs = [];
      clips = [];
    }
  }

  // Save the number samples used for training
  model.samples = s;

  // Return the training stats for the last 10 epochs
  return {
    ppls: ppls,
    costs: costs,
    clips: clips
  };
};

// Return the target class label prediction probabilities for the given list
// of featuresets
export const decisionFunction = (model, X, istate) => {
  // Clear the number pool
  clear(model.pool);

  // Start with optional input state
  let state = istate || {};

  // Compute the output probabilities P from input X and state
  const P = toArray(map(X, (x) => {

    // Create a computation graph
    const G = graph(model.pool);

    // Feed forward the network and interpret output as log probabilities
    const [logprobs, hidden] = model.forward(model.network, G, x, state);
    
    // Remember the state of the network's hidden activations, as we'll
    // feed it back into it on the next forward feed
    state = hidden;

    // Compute softmax probabilities
    const probs = softmax(G, logprobs);
    return probs.w;  
  }));

  // If we were given a input state, return it with the prediction Y,
  // otherwise just return the prediction
  return istate ? [P, state] : P;
};

// Predict the best target class labels for the given list of featuresets
export const predict = (model, X, istate) => {
  // Clear the number pool
  clear(model.pool);

  // Start with optional input state
  let state = istate || {};

  // Predict Y from input X and state
  const Y = toArray(map(X, (x) => {

    // Create a computation graph
    const G = graph(model.pool);

    // Feed forward the network and interpret output as log probabilities
    const [logprobs, hidden] = model.forward(model.network, G, x, state);
    
    // Remember the state of the network's hidden activations, as we'll
    // feed it back into it on the next forward feed
    state = hidden;

    // Compute softmax probabilities
    const probs = softmax(G, logprobs);

    // Pick the prediction with the highest probability
    return argmax(probs.w);  
  }));

  // If we were given a input state, return it with the prediction Y,
  // otherwise just return the prediction
  return istate ? [Y, state] : Y;
};

