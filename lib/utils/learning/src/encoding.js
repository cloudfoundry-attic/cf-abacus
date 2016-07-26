// Small utility to help encode raw feature vectors into labels

// API loosely inspired by the Python scikit-learn LabelEncoder API
// (see http://scikit-learn.org/stable/modules/classes.html)

import { forEach, map, toArray } from 'abacus-iterable';

// Return a label encoder
export const encoder = (X) => {
  const e = {
    X: [],
    Y: new Map()
  };
  e.toJSON = () => ({
    X: e.X
  });
  return e;
};

// Learn the given feature vectors
export const fit = (encoder, X) => {
  forEach(X, (x) => {
    if(!encoder.Y.has(x)) {
      encoder.Y.set(x, encoder.X.length);
      encoder.X.push(x);
    }
  });
};

// Transform feature vectors to normalized label encodings
export const transform = (encoder, X) => {
  // Cache the normalized labels in an array
  return Float64Array.from(map(X, (x) => {
    const y = encoder.Y.get(x);
    if(y === undefined)
      throw new Error('Couldn\'t encode unknown value \'' + x + '\'');
    return y;
  }));
};

// Learn the given feature vectors and transform them to normalized label
// encodings
export const fitTransform = (encoder, X) => {
  fit(encoder, X);
  return transform(encoder, X);
};

// Transform labels back to original feature vectors
export const inverseTransform = (encoder, Y) => {
  return toArray(map(Y, (y) => encoder.X[y]));
};

