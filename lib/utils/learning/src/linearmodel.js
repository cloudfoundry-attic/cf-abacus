// A simple averaged perceptron linear model

// API loosely inspired by the Python scikit-learn classifier API
// (see http://scikit-learn.org/stable/modules/classes.html)

import { map, forEach, zip, toArray, shuffle } from 'abacus-iterable';
import { dense, toCSC, toDense } from 'abacus-matrix';
import debug from 'abacus-debug';

// Setup debug log
const log = debug('abacus-learning');

// Create a (tstamp, weight) matrix
export const twmatrix = (n, d) => {
  return {
    n: n,
    d: d,
    w: dense(n, d),
    ts: dense(n, d)
  };
};

// Return an averaged weight
const averagedWeight = (w, ts, samples) => {
  return (samples - ts) * w / samples;
};

// Compute the score of each class label for the given featureset x
const decisionFunctionOne = (x, weights, scores, samples) => {
  scores.fill(0.0);
  const osize = scores.length;
  const i = x.values();
  for(let f = i.next(); !f.done; f = i.next())
    for(let l = 0, fl = f.value * osize; l < osize; l++, fl++)
      scores[l] += samples ?
        averagedWeight(weights.w[fl], weights.ts[fl], samples) :
        weights.w[fl];
  return scores;
};

// Predict the best class for the given featureset
const predictOne = (x, weights, scores, samples) => {
  // Compute the scores
  decisionFunctionOne(x, weights, scores, samples);

  // Pick the highest label with the highest score
  let guess = 0;
  let best = 0.0;
  for(let l = 0, osize = scores.length; l < osize; l++)
    if(scores[l] > best) {
      best = scores[l];
      guess = l;
    }
  return guess;
};

// Update the weight of a feature / label cell
const updateWeight = (weights, fx, l, v, samples) => {
  const fl = fx + l;
  weights.w[fl] += v;
  weights.ts[fl] = samples;
};

// Update the weights of a featureset
const updateWeights = (x, weights, osize, gold, guess, samples) => {
  if(gold !== guess) {
    const i = x.values();
    for(let f = i.next(); !f.done; f = i.next()) {
      const fx = f.value * osize;
      updateWeight(weights, fx, gold, 1.0, samples);
      updateWeight(weights, fx, guess, -1.0, samples);
    }
  }
};

// Return an averaged perceptron linear model
export const model = (isize, osize, epochs = 5) => {
  const p = {
    // Number of training epochs
    epochs: epochs,

    // Number of input features and output labels
    isize: isize,
    osize: osize,

    // Number of samples seen
    samples: 0,

    // Features * osize * (weight, tstamp) matrix
    weights: twmatrix(isize, osize)
  };

  log('Allocated perceptron model matrix %d Mb',
    Math.ceil(p.weights.n * p.weights.d * 2 * 4 / 1048576));

  // Customize JSON format
  p.toJSON = () => ({
    isize: p.isize,
    osize: p.osize,
    samples: p.samples,
    weights: {
      n: p.weights.n,
      d: p.weights.d,
      w: toCSC(p.weights.w, p.weights.n, p.weights.d),
      ts: toCSC(p.weights.ts, p.weights.n, p.weights.d)
    }
  });
  return p;
};

// Load a weight matrix data into a model
export const load = (model, samples, data) => {
  model.samples = samples;
  model.weights = {
    n: data.n,
    d: data.d,
    w: toDense(data.w, data.n, data.d),
    ts: toDense(data.ts, data.n, data.d)
  };
};

// Train a model from a featureset and the corresponding class labels
export const fit = (model, X, Y) => {
  const weights = model.weights;
  const osize = model.osize;
  const scores = new Float64Array(osize);
  let samples = model.samples;

  // Run the configured number of training iterations
  const T = toArray(zip(X, Y));
  const epochs = model.epochs;
  for(let e = 0; e < epochs; e++) {
    log('Training epoch %d', e);
    forEach(T, ([x, gold]) => {

      // Predict target label from features, using the raw weights
      const y = predictOne(x, weights, scores, samples);

      // Update the training weights
      samples++;
      updateWeights(x, weights, osize, gold, y, samples);
    });
    log('Trained with %d samples', samples);

    // Shuffle the training set
    shuffle(T);
  };

  // Save the number of samples we've seen
  model.samples = samples;
};

// Predict the best class labels for the given featuresets
export const predict = (model, X) => {
  const weights = model.weights;
  const osize = model.osize;
  const scores = new Float64Array(osize);
  const samples = model.samples;

  // Predict class labels from features, using the averaged weights
  return map(X,
    (x) => predictOne(x, weights, scores, samples));
};

// Compute the scores of each class label for the given featuresets
export const decisionFunction = (model, X) => {
  const weights = model.weights;
  const scores = new Float64Array(model.osize);

  // Predict class labels from features, using the averaged weights
  return map(X,
    (x) => decisionFunctionOne(x, weights, scores, model.samples));
};

// Return the sparsity of a model
export const sparsity = (model) => {
  const weights = model.weights;
  const osize = model.osize;
  const isize = model.isize;
  let zcells = 0;
  let zrows = 0;
  for(let f = 0; f < isize; f++) {
    let zrow = true;
    for(let l = 0, fl = f * osize; l < osize; l++, fl++)
      if(weights.ts[fl] === 0)
        zcells++;
      else
        zrow = false;
    if(zrow)
      zrows++;
  };
  return {
    rows: zrows / isize,
    cells: zcells / (isize * osize)
  };
};

// Compute the accuracy score of a set of predicted class labels vs a
// gold set
export const score = (test, gold) => {
  const s = reduce(zip(test, gold), (s, [t, g]) => ({
    ok: t === g ? s.ok + 1 : s.ok,
    total: s.total + 1
  }), {
    ok: 0,
    total: 0
  });
  return s.ok / s.total;
};

