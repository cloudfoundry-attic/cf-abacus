'use strict';

const router = require('abacus-router');

const createRouter = (collection) => {
  const route = router();
  route.get('/metrics', (req, resp) => {
    const summary = collection.summary();
    resp.send(summary);
  });
  return route;
};

module.exports = {
  createRouter
};
