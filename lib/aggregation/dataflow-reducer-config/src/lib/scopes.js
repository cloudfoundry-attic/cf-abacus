'use strict';

// Return OAuth system scopes needed to write input docs
const iwscope = (secured) => (udoc) =>
  secured()
    ? { system: ['abacus.usage.write'] }
    : undefined;

// Return OAuth system scopes needed to read input and output docs
const rscope = (secured) => (udoc) =>
  secured()
    ? { system: ['abacus.usage.read'] }
    : undefined;

module.exports = {
  iwscope,
  rscope
};
