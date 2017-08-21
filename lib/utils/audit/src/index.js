'use strict';

const audit = (message, ...args) => {
  console.log(`[audit] ${message}`, ...args);
};

// Export our public functions
module.exports = audit;
