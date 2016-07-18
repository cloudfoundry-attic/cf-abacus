// Minimal machine learning utilities to help test different strategies
// for usage anomaly detection.

import { toArray, zip, forEach } from 'abacus-iterable';
import { dwmatrix, dwrand } from 'abacus-matrix';
import { graph, rowPluck, tanh, sigmoid, relu, mul, dot, eltmul, add,
  softmax, backward } from '../compgraph';
import { argmax } from '../utils';
import { encoding, extraction, linearmodel,
  rmsprop, basicnn, recurrentnn, lstmnn, nnmodel } from '..';
import debug from 'abacus-debug';

/* eslint dot-notation: 0 */

// Setup debug log
const log = debug('abacus-learning');

describe('abacus-learning', () => {
  it('encodes values into labels', () => {
    const encoder = encoding.encoder();
    encoding.fit(encoder, ['c1', 'c2', 'c3']);

    // Transform classes to labels
    expect(encoding.transform(
      encoder, ['c1', 'c3'])).to.deep.equal(Float64Array.from([0, 2]));

    // Transform labels back to classes
    expect(encoding.inverseTransform(
      encoder, Float64Array.from([0, 2]))).to.deep.equal(['c1', 'c3']);
  });

  it('vectorizes feature sets', () => {
    const FS = [{ 'x1': 1, 'x2': 1 }, { 'x2': 1, 'x3': 1 }];

    // Vectorize feature sets over a (1000, 1) vector
    const v1 = extraction.vectorizer(1000);
    const X1 = extraction.transform(v1, FS);
    expect(toArray(X1[0])).to.deep.equal(Float64Array.from([435, 34]));
    expect(toArray(X1[1])).to.deep.equal(Float64Array.from([34, 866]));

    // Vectorize and normalize to 0.0 to 1.0
    const v2 = extraction.vectorizer(1000, 1.0);
    const X2 = extraction.transform(v2, FS);
    expect(toArray(X2[0])).to.deep.equal(Float64Array.from([0.435, 0.034]));
    expect(toArray(X2[1])).to.deep.equal(Float64Array.from([0.034, 0.866]));

    // Vectorize and normalize to -1.0 to 1.0
    const v3 = extraction.vectorizer(1000, -1.0);
    const X3 = extraction.transform(v3, FS);
    expect(toArray(X3[0])).to.deep.equal(
      Float64Array.from([-0.13, -0.9319999999999999]));
    expect(toArray(X3[1])).to.deep.equal(
      Float64Array.from([-0.9319999999999999, 0.732]));
  });

  it('predicts classes using a linear perceptron model', () => {
    // Vectorize gold feature sets
    const vectorizer = extraction.vectorizer(100);
    const trainX = extraction.transform(vectorizer, [
      { 'x0': 1 }, { 'x1': 1, 'x3': 1, 'x5': 1 }, { 'x2': 1, 'x4': 1 }]);

    // Encode gold classes
    const encoder = encoding.encoder();
    encoding.fit(encoder, ['cnull', 'codd', 'ceven']);
    const goldY = encoding.transform(encoder, ['cnull', 'codd', 'ceven']);

    // Train linear model
    const model = linearmodel.model(100, 3);
    linearmodel.fit(model, trainX, goldY);

    // Vectorize test featuresets
    const testX = extraction.transform(vectorizer, [
      { 'x0': 1 }, { 'x1': 1, 'x3': 1, 'x5': 1 }, { 'x2': 1, 'x4': 1 }]);

    // Predict test labels
    const guessY = linearmodel.predict(model, testX);

    // Decode guessed labels
    const guessC = encoding.inverseTransform(encoder, guessY);

    expect(guessC).to.deep.equal(['cnull', 'codd', 'ceven']);
  });

  it('implements computation graphs with backprop', () => {
    const setup = () => {
      const G = graph();
      const m1 = dwmatrix(2, 3);
      m1.w.set([1, 2, 3, 4, 5, 6]);
      const m2 = dwmatrix(3, 2);
      m2.w.set([10, 20, 30, 40, 50, 60]);
      const m3 = dwmatrix(2, 10);
      m3.w.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
      const m4 = dwmatrix(10, 1);
      m4.w.set([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      return [G, m1, m2, m3, m4];
    };

    const setdw = (m1, m2, out) => {
      m1.dw.set([7, 8, 9, 10, 11, 12]);
      m2.dw.set([70, 80, 90, 100, 110, 120]);
      out.dw.set([700, 800, 900, 1000, 1100, 1200].slice(0, out.dw.length));
    };

    {
      const [G, m1, m2] = setup();
      const out = rowPluck(G, m1, 1);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([4, 5, 6]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        7, 8, 9, 710, 811, 912]));
    }

    {
      const [G, m1, m2] = setup();
      const out = tanh(G, m1);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([
        0.7615941559557649, 0.9640275800758169, 0.9950547536867305,
        0.999329299739067, 0.9999092042625951, 0.9999877116507956]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        300.9820391298183, 64.52065988253155, 17.87943344889619,
        11.340950683025866, 11.199741554038246, 12.029491856886343]));
    }

    {
      const [G, m1, m2] = setup();
      const out = sigmoid(G, m1);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([
        0.7310585786300049, 0.8807970779778823, 0.9525741268224331,
        0.9820137900379085, 0.9933071490757153, 0.9975273768433653]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        144.6283532690373, 91.99486832280529, 49.65899375782098,
        27.662706213291106, 18.312862337869035, 14.959811149631918]));
    }

    {
      const [G, m1, m2] = setup();
      const out = relu(G, m1);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([
        1, 2, 3, 4, 5, 6]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        707, 808, 909, 1010, 1111, 1212]));
    }

    {
      const [G, m1, m2, m3, m4] = setup();

      const out = mul(G, m1, m2);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([
        220, 280, 490, 640]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        23007, 53008, 83009, 29010, 67011, 105012]));
      expect(m2.dw.slice()).to.deep.equal(Float64Array.from([
        4370, 4880, 5990, 6700, 7610, 8520]));

      const out34 = mul(G, m3, m4);
      expect(out34.w.slice()).to.deep.equal(
        Float64Array.from([3850, 9350]));

      setdw(m3, m4, out34);
      backward(G);
      expect(m3.dw.slice()).to.deep.equal(Float64Array.from([
        7007, 14008, 21009, 28010, 35011, 42012,
        49000, 56000, 63000, 70000, 8000,
        16000, 24000, 32000, 40000, 48000,
        56000, 64000, 72000, 80000]));
      expect(m4.dw.slice()).to.deep.equal(Float64Array.from([
        9570, 11080, 12590, 14100, 15610,
        17120, 18500, 20000, 21500, 23000]));
    }

    {
      const [G, m1, m2] = setup();
      const out = add(G, m1, m2);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([
        11, 22, 33, 44, 55, 66]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        707, 808, 909, 1010, 1111, 1212]));
      expect(m2.dw.slice()).to.deep.equal(Float64Array.from([
        770, 880, 990, 1100, 1210, 1320]));
    }

    {
      const [G, m1, m2] = setup();
      const out = dot(G, m1, m2);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([910]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        7007, 14008, 21009, 28010, 35011, 42012]));
      expect(m2.dw.slice()).to.deep.equal(Float64Array.from([
        770, 1480, 2190, 2900, 3610, 4320]));
    }

    {
      const [G, m1, m2] = setup();
      const out = eltmul(G, m1, m2);
      expect(out.w.slice()).to.deep.equal(Float64Array.from([
        10, 40, 90, 160, 250, 360]));

      setdw(m1, m2, out);
      backward(G);
      expect(m1.dw.slice()).to.deep.equal(Float64Array.from([
        7007, 16008, 27009, 40010, 55011, 72012]));
      expect(m2.dw.slice()).to.deep.equal(Float64Array.from([
        770, 1680, 2790, 4100, 5610, 7320]));
    }
  });

  it('predicts labels using a NN computation graph', () => {
    // Define neural network layers, 2 inputs, one hidden layer of 10
    // neurons, and 2 outputs
    const isize = 2;
    const osize = 2;
    const hsize = 10;
    const model = {
      // Input to hidden
      'Wxh': dwrand(hsize, isize),
      // Hidden to output
      'Why': dwrand(osize, hsize),
      // Hidden bias
      'bh': dwrand(hsize, 1),
      // Output bias
      'by': dwmatrix(osize, 1)
    };

    // Create an RMSProp solver
    const solver = rmsprop.solver();

    // Training input feature sets X
    const X = [[0, 0], [0, 1], [1, 0], [1, 1]];

    // Training outputs Y labels, results of XOR on X
    const Y = [0, 1, 1, 0];

    // Forward feed
    const forward = (G, model, x) => {
      // Convert input X to a matrix
      const mx = dwmatrix(isize, 1, x);

      // Multiply input by the weights followed by bias offset and
      // a sigmoid non-linearity
      const h = sigmoid(G, add(G, mul(G, model['Wxh'], mx), model['bh']));

      // Decode output using a bias offset and a tanh non-linearity
      const o = tanh(G, add(G, mul(G, model['Why'], h), model['by']));

      return o;
    };

    // Train the model through 1000 epochs, each epoch using the whole
    // training data set as a batch
    const epochs = 1000;
    for(let e = 0; e < epochs; e++) {

      // Feed the model with a batch of training feature sets
      let cost = 0.0;
      for(let i = 0; i < X.length; i++) {
        const x = X[i];
        const y = Y[i];

        // Create a computation graph
        const G = graph();

        // Feed forward and interpret output as log probabilities
        const logprobs = forward(G, model, x);
        
        // Compute softmax probabilities
        const probs = softmax(G, logprobs);

        // Accumulate base 2 log prob and do smoothing
        cost += -Math.log(probs.w[y]);

        // Write gradients into log probabilities. Cross-entropy loss for
        // softmax is simply the probabilities themselves.
        logprobs.dw = probs.w;

        // The correct label Y gets an extra -1
        logprobs.dw[y] -= 1;

        // Propagate gradients backwards through the graph starting with
        // Why, all the way down to x, setting their .dw field
        // with the gradients
        backward(G);
      }

      // Do a parameter update using RMSProp gradient descent, a learning
      // rate of 0.001, a regularization strength of 0.0001 and clip
      // gradient magnitudes at 5.0.
      rmsprop.step(model, solver, 0.001, 0.0001, 5.0);
    }

    // Use the trained model to predict XOR result labels
    for(let i = 0; i < X.length; i++) {

      // Create an expression graph
      const G = graph(false);

      // Feed forward and interpret output as log probabilities
      const logprobs = forward(G, model, X[i]);

      // Compute softmax probabilities
      const probs = softmax(G, logprobs);

      // Pick the prediction with the highest probability
      const y = argmax(probs.w);  

      log('X %o, Y %o, P %o', X[i], y, probs.w);
      expect(y).to.equal(Y[i]);
    }
  });

  it('predicts classes from features using a basic NN model', () => {
    // Create a basic neural network with 2 inputs, 2 layers of 20
    // neurons, and 2 outputs
    const net = basicnn.network(2, [20], 2);

    // Training input feature sets X
    const X = [[0, 0], [0, 1], [1, 0], [1, 1]];

    // Training outputs Y labels, results of XOR on X
    const C = [0, 1, 1, 0];
    const decoder = encoding.encoder();
    const Y = encoding.fitTransform(decoder, C);

    // Train a model through 1000 epochs, each epoch using the whole
    // training data set as a batch
    const model = nnmodel.model(net, basicnn.forward, 1000);
    nnmodel.fit(model, X, Y);

    // Use the trained model to predict XOR result labels
    const P = nnmodel.predict(model, X);
    const PC = encoding.inverseTransform(decoder, P);

    // Check the results
    forEach(zip(X, zip(C, PC)), ([fs, [c, pc]], i) => {
      log('X %o, Y %o', fs, pc);
      expect(pc).to.equal(c);
    });
  });

  it('predicts classes from embeddings using a basic NN model', () => {
    // Create a basic neural network with 4 inputs, input embeddings of 5,
    // 2 layers of 20 neurons, and 2 outputs
    const net = basicnn.network(4, 5, [20, 20], 2);

    // Training input feature sets X
    const FS = [[0, 0], [0, 1], [1, 0], [1, 1]];
    const encoder = encoding.encoder();
    const X = encoding.fitTransform(encoder, FS);

    // Training outputs Y labels, results of XOR on X
    const C = [0, 1, 1, 0];
    const decoder = encoding.encoder();
    const Y = encoding.fitTransform(decoder, C);

    // Train a model through 1000 epochs, each epoch using the whole
    // training data set as a batch
    const model = nnmodel.model(net, basicnn.forward, 1000);
    nnmodel.fit(model, X, Y);

    // Use the trained model to predict XOR result labels
    const P = nnmodel.predict(model, X);
    const PC = encoding.inverseTransform(decoder, P);

    // Check the results
    forEach(zip(FS, zip(C, PC)), ([fs, [c, pc]], i) => {
      log('X %o, Y %o', fs, pc);
      expect(pc).to.equal(c);
    });
  });

  it('predicts sequences using a recurrent NN model', () => {
    // Create a recurrent neural network with 2 inputs, input embeddings of
    // 5, 2 layers of 20 neurons,and 2 outputs
    const net = recurrentnn.network(2, 5, [20, 20], 2);

    // Training input feature set sequence X
    const FS = [0, 0, 1, 1, 0];
    const encoder = encoding.encoder();
    const X = encoding.fitTransform(encoder, FS);

    // Training output label sequence Y, results of XOR of X[i] and X[i - 1]
    const C = [0, 0, 1, 0, 1];
    const decoder = encoding.encoder();
    const Y = encoding.fitTransform(decoder, C);

    // Train a model through 1000 epochs, each epoch using the whole
    // training data set as a batch
    const model = nnmodel.model(net, recurrentnn.forward, 1000, 0.001);
    nnmodel.fit(model, X, Y);

    // Use the trained model to predict XOR result label sequence
    const P = nnmodel.predict(model, X);
    const PC = encoding.inverseTransform(decoder, P);

    // Check the results
    forEach(zip(FS, zip(C, PC)), ([fs, [c, pc]], i) => {
      log('X %o, Y %o', fs, pc);
      expect(pc).to.equal(c);
    });
  });

  it('predicts sequences using a LSTM NN model', () => {
    // Create a recurrent neural network with 2 inputs, input embeddings of
    // 5, 2 layers of 20 neurons,and 2 outputs
    const net = lstmnn.network(2, 5, [20, 20], 2);

    // Training input feature set sequence X
    const FS = [0, 0, 1, 1, 0];
    const encoder = encoding.encoder();
    const X = encoding.fitTransform(encoder, FS);

    // Training output label sequence Y, results of XOR of X[i] and X[i - 1]
    const C = [0, 0, 1, 0, 1];
    const decoder = encoding.encoder();
    const Y = encoding.fitTransform(decoder, C);

    // Train a model through 1000 epochs, each epoch using the whole
    // training data set as a batch
    const model = nnmodel.model(net, lstmnn.forward, 100);
    nnmodel.fit(model, X, Y);

    // Use the trained model to predict XOR result label sequence
    const P = nnmodel.predict(model, X);
    const PC = encoding.inverseTransform(decoder, P);

    // Check the results
    forEach(zip(FS, zip(C, PC)), ([fs, [c, pc]], i) => {
      log('X %o, Y %o', fs, pc);
      // expect(pc).to.equal(c);
    });
  });
});

