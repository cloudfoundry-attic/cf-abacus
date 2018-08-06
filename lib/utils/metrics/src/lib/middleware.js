'use strict';

const router = require('abacus-router');
const { NOT_FOUND: STATUS_NOT_FOUND, OK: STATUS_OK } = require('http-status-codes');


const createRouter = (collection) => {
  const metricSummaryAsync = async(metric) => {
    return metric.summary();
  };

  const metricReportAsync = async(metric) => {
    return metric.report();
  };

  const fullSummaryAsync = async() => {
    let result = {
      counters: {},
      bulletins: {},
      gauges: {}
    };
    for (let counter of collection.counterIterator()) {
      const summary = await metricSummaryAsync(counter, true);
      result.counters[counter.name] = summary;
    }
    for (let bulletin of collection.bulletinIterator()) {
      const summary = await metricSummaryAsync(bulletin, true);
      result.bulletins[bulletin.name] = summary;
    }
    for (let gauge of collection.gaugeIterator()) {
      const summary = await metricSummaryAsync(gauge, true);
      result.gauges[gauge.name] = summary;
    }
    return result;
  };

  const route = router();

  route.get('/', async(req, resp) => {
    const summary = await fullSummaryAsync();
    return {
      statusCode: STATUS_OK,
      body: summary
    };
  });

  route.get('/counters/:id', async(req, resp) => {
    const id = req.params.id;
    const counter = collection.findCounter(id);
    if (!counter)
      return {
        statusCode: STATUS_NOT_FOUND
      };

    const report = await metricReportAsync(counter);
    return {
      statusCode: STATUS_OK,
      body: report
    };
  });

  route.get('/bulletins/:id', async(req, resp) => {
    const id = req.params.id;
    const bulletin = collection.findBulletin(id);
    if (!bulletin)
      return {
        statusCode: STATUS_NOT_FOUND
      };

    const report = await metricReportAsync(bulletin);
    return {
      statusCode: STATUS_OK,
      body: report
    };
  });

  route.get('/gauges/:id', async(req, resp) => {
    const id = req.params.id;
    const gauge = collection.findGauge(id);
    if (!gauge)
      return {
        statusCode: STATUS_NOT_FOUND
      };

    const report = await metricReportAsync(gauge);
    return {
      statusCode: STATUS_OK,
      body: report
    };
  });

  return route;
};

module.exports = {
  createRouter
};
