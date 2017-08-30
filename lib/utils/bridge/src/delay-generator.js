'use strict';

const create = (startValue, maxValue) => {
  let count = 0;
  return {
    getNext: () => {
      const value = startValue + Math.floor(Math.expm1(count));
      count++;
      return Math.min(value, maxValue);
    },
    reset: () => {
      count = 0;
    }
  };
};

module.exports = create;
