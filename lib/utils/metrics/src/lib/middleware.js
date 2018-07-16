'use strict';

const router = require('abacus-router');

const createRouter = (collection) => {
  const metricSummaryAsync = async(metric) => {
    return metric.summary();
  };

  const fullSummaryAsync = async() => {
    let result = {
      counters: {},
      bulletins: {}
    };
    for (let counter of collection.counterIterator()) {
      const summary = await metricSummaryAsync(counter);
      result.counters[counter.name] = summary;
    }
    for (let bulletin of collection.bulletinIterator()) {
      const summary = await metricSummaryAsync(bulletin);
      result.bulletins[bulletin.name] = summary;
    }
    return result;
  };

  const route = router();
  route.get('/', async(req, resp) => {
    const summary = await fullSummaryAsync();
    resp.send(summary);
  });
  return route;
};

module.exports = {
  createRouter
};
