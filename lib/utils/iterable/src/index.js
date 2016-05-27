// Simple functional operators similar to the underscore.js map, forEach, etc
// but working on ECMAScript 6 iterables instead of arrays and objects.

import * as util from 'util';

// Convert a function that creates an iterator to an iterable list
export const iterable = (cf, l) => {
  const list = l || {};
  Object.defineProperty(list, 'inspect', {
    writable: true,
    configurable: true,
    enumerable: false,
    value: function() {
      return '(' +
        reduce(this,
          (s, x) => s + (s.length ? ', ' : '') + util.inspect(x), '') +
        ')';
    }
  });
  list[Symbol.iterator] = cf;
  return list;
};

// Convert an iterable list to an iterator over its values
export const iterator = (list) => list[Symbol.iterator]();

// Marks the end of an iterator
const done = {
  done: true
};

// Apply a map function to an iterable list
export const map = (list, f) => {
  return iterable(() => {
    const it = iterator(list);
    let i = 0;
    return {
      next: () => {
        const n = it.next();
        const v = n.done ? done : {
          done: false,
          value: f(n.value, i)
        };
        i++;
        return v;
      }
    };
  });
};

// Apply a filter function to an iterable list
export const filter = (list, f) => {
  return iterable(() => {
    const it = iterator(list);
    let i = 0;
    return {
      next: () => {
        while(true) {
          const n = it.next();
          if(n.done)
            return done;
          const r = f(n.value, i);
          i++;
          if(r)
            return n;
        }
      }
    };
  });
};

// Return an iterable over a range
export const range = (start, stop, step = 1) => {
  return iterable(() => {
    let i = start;
    return {
      range: {
        start: start,
        stop: stop,
        step: step
      },
      next: () => {
        if(i >= stop)
          return done;
        const v = {
          done: false,
          value: i
        };
        i += step;
        return v;
      }
    };
  });
};

// Execute a function for each value of an iterable list
export const forEach = (list, f) => {
  const it = iterator(list);
  if(it.range) {
    const start = it.range.start;
    const stop = it.range.stop;
    const step = it.range.step;
    for(let i = start; i < stop; i += step)
      f(i);
    return;
  }
  let n = it.next();
  let i = 0;
  while(!n.done) {
    f(n.value, i);
    n = it.next();
    i++;
  }
};

// Apply a reduce function to an iterable list
export const reduce = (list, f, accum) => {
  const it = iterator(list);
  if(it.range) {
    const start = it.range.start;
    const stop = it.range.stop;
    const step = it.range.step;
    let a = accum;
    for(let i = start; i < stop; i += step)
      a = f(a, i, i);
    return a;
  }
  let a = accum;
  let n = it.next();
  let i = 0;
  while(!n.done) {
    a = f(a, n.value, i);
    n = it.next();
    i++;
  }
  return a;
};

// Convert an object to an iterable list of keys
export const keys = (o) => {
  return Object.keys(o);
};

// Return an iterable list for a single value
export const singleton = (v) => {
  return iterable(() => {
    let d = false;
    return {
      next: () => {
        if(d)
          return done;
        d = true;
        return {
          done: false,
          value: v
        };
      }
    };
  });
};

// Return the first element of an iterable list
export const first = (list) => {
  return iterator(list).next().value;
};

// Return an iterable list of the first elements of an iterable list
export const take = (list, n) => {
  return iterable(() => {
    const it = iterator(list);
    let i = 0;
    return {
      next: () => {
        if(i >= n)
          return done;
        i++;
        return it.next();
      }
    };
  });
};

// Return an iterable list of the elements of an iterable list starting
// from the given index
export const drop = (list, n) => {
  return iterable(() => {
    const it = iterator(list);
    let i = 0;
    let v;
    return {
      next: () => {
        if(v && v.done)
          return done;
        v = it.next();
        i++;
        while(i <= n) {
          v = it.next();
          i++;
          if(v.done)
            return done;
        }
        return v;
      }
    };
  });
};

// Return the length of an iterable list
export const length = (list) => {
  if(list.length !== undefined)
    return list.length;
  if(list._length !== undefined)
    return list._length;
  const it = iterator(list);
  let l = 0;
  while(!it.next().done)
    l++;
  list._length = l;
  return l;
};

// Convert an iterable list to an array
export const toArray = (list) => {
  if(list.length !== undefined)
    return list;
  return Array.from(list);
};

// Shuffle an array
export const shuffle = (array) => {
  forEach(array, (v, i) => {
    const j = Math.floor(Math.random() * (i + 1));
    array[i] = array[j];
    array[j] = v;
  });
};

// Convert two iterable lists to an iterable list of pairs
export const zip = (listx, listy) => {
  return iterable(() => {
    const itx = iterator(listx);
    const ity = iterator(listy);
    return {
      next: () => {
        const x = itx.next();
        return x.done ? done : {
          done: false,
          value: [x.value, ity.next().value]
        };
      }
    };
  });
};

// Join an iterable list of iterable lists
export const join = (lists) => {
  return iterable(() => {
    const itl = iterator(lists);
    let it = undefined;
    return {
      next: () => {
        // Go over the iterables and their iterators until we get a value
        while(true) {
          if(!it) {
            const c = itl.next();
            if(c.done)
              return done;
            it = iterator(c.value);
          }
          const v = it.next();
          if(!v.done)
            return v;
          it = undefined;
        }
      }
    };
  });
};

