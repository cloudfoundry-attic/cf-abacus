'use strict';

// A function that returns sequential time-based ids. The ids are formed from
// the current time, app index, cluster worker id, and a counter

const vcapenv = require('abacus-vcapenv');
const cluster = require('abacus-cluster');

// Pad with zeroes up to 16 digits
const pad16 = (t) => {
  const trim = (s) => s[0] === '0' && (s[1] >= '0' && s[1] <= '9') ?
      trim(s.substr(1)) : s;
  const tt = trim(t.toString());
  const n = parseInt(tt).toString();
  const s = '0000000000000000' + n;
  return s.slice(s.length - 16) + tt.toString().substr(n.length);
};

// Return a unique time-based id string
let id = {
  t: 0,
  c: 0
};
const seqid = () => {
  const t = Date.now();
  id = t <= id.t ? {
    t: id.t,
    c: id.c + 1
  } : {
    t: t,
    c: 0
  };
  return [pad16(id.t),
    vcapenv.appindex(), vcapenv.iindex(), cluster.wid(), id.c].join('-');
};

// Sample the time component of a unique time-based id
const sample = (id, div) => {
  if(id === undefined)
    return undefined;
  if(div === 1)
    return id;
  const [t, appindex, iindex, wid] = id.split('-');
  const st = Math.floor(parseInt(t) / div) * div;
  return [pad16(st), appindex, iindex, wid, 0].join('-');
};

// Export our public functions
module.exports = seqid;
module.exports.pad16 = pad16;
module.exports.sample = sample;

