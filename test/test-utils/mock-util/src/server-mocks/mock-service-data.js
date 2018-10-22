'use strict';

module.exports = () => {
  let serviceRequests = [];

  let returnAlways;
  let returnSeries = [];
  let returnMap = new Map();

  return {
    request: (n) => serviceRequests[n],
    requests: () => serviceRequests,
    responseFor: (key) => {
      return returnMap.get(key);
    },
    nextResponse: () => {
      if (returnAlways) return returnAlways;

      const requestNumber = serviceRequests.length - 1;
      return returnSeries[requestNumber];
    },
    return: {
      firstTime: (value) => returnSeries[0] = value,
      secondTime: (value) => returnSeries[1] = value,
      thirdTime: (value) => returnSeries[2] = value,
      series: (values) => returnSeries = values,
      always: (value) => returnAlways = value,
      for: (key) => ({
        value: (returnValue) => returnMap.set(key, returnValue)
      }),
      nothing: () => returnSeries = []
    },
    clear: () => {
      serviceRequests = [];
    }
  };
};
