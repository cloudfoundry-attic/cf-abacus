'use strict';

module.exports = (serviceMock) => ({
  received: (numberOfRequests) =>
    async () => {
      const actualRequestsCount = serviceMock.requests().length;
      if (actualRequestsCount < numberOfRequests)
        throw new Error(`The number of requests (${actualRequestsCount}) has not reached "${numberOfRequests} yet"`);
    }
});
