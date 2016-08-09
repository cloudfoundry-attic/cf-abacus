// Small utility to help extract features and convert them to feature
// vectors

// API loosely inspired by the Python scikit-learn FeatureHasher API
// (see http://scikit-learn.org/stable/modules/classes.html)

import * as murmurhash from 'murmurhash';
import { map, filter, keys, toArray } from 'abacus-iterable';

// Default number of vectorized features
export const MAXFEATURES = 1000;

// Return a feature vectorizer for a number of unique features n
export const vectorizer = (n = MAXFEATURES, s) => {
  return {
    n: n,
    s: s === undefined ? 1.0 : s > 0.0 ? s / n : -s * 2 / n,
    b: s < 0.0 ? s : 0.0 
  };
};

// Cache the vectorized features in an array
export const transform = (vectorizer, X) => {
  const n = vectorizer.n;
  const s = vectorizer.s;
  const b = vectorizer.b;
  return toArray(map(X, (x) =>
    Float64Array.from(map(filter(keys(x), (k) => x[k]),
      (k) => murmurhash.v3('' + k, 42) % n * s + b))));
};

export const fitTransform = (vectorizer, X) => {
  return transform(vectorizer, X);
};

