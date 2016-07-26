// Misc math utilities

// Return the argmax of array w
export const argmax = (w) => {
  let maxv = w[0];
  let maxix = 0;
  for(let i = 1, n = w.length; i < n; i++) {
    const v = w[i];
    if(v > maxv) {
      maxix = i;
      maxv = v;
    }
  }
  return maxix;
};

export const randf = (a, b) => {
  return Math.random() * (b - a) + a;
};

export const randi = (a, b) => {
  return Math.floor(Math.random() * (b - a) + a);
};

// Sample argmax from w, assuming w are probabilities that sum to one
export const samplei = (w) => {
  const r = randf(0,1);
  let x = 0.0;
  let i = 0;
  while(true) {
    x += w[i];
    if(x > r)
      return i;
    i++;
  }
};

// Return the median of a list of values
export const median = (values) => {
  values.sort((a,b) => a - b);
  const half = Math.floor(values.length / 2);
  if(values.length % 2)
    return values[half];
  return (values[half - 1] + values[half]) / 2.0;
};

