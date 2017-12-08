'use strict';

module.exports = () => {
  const serviceRequests = [];

  let returnAlways;
  let returnSeries = [];
  const returnKeyValue = {};

  return {
    request: (n) => serviceRequests[n],
    requests: () => serviceRequests,
    responseFor: (key) => {
      return returnKeyValue[key];
    },
    nextResponse: (scopes) => {
      if (returnAlways) return returnAlways;

      const requestNumber = serviceRequests.length - 1;
      return returnSeries[requestNumber];
    },
    return: {
      firstTime: (value) => (returnSeries[0] = value),
      secondTime: (value) => (returnSeries[1] = value),
      series: (values) => (returnSeries = values),
      always: (value) => (returnAlways = value),
      for: (key) => ({
        value: (returnValue) => (returnKeyValue[key] = returnValue)
      })
    }
  };
};
