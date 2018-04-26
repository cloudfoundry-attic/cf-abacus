'use strict';

const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const meteringConfig = require('abacus-metering-config');
const fs = require('fs');
const util = require('util');

const colorize = (t) => util.inspect(t, {
  showHidden: false,
  depth: null,
  colors: true,
  breakLength: process.stdout.columns
});

const maxValue = process.env.MAX_VALUE ? parseInt(process.env.MAX_VALUE) : 15;
const retries = process.env.RETRIES ? parseInt(process.env.RETRIES) : 5;

const randomInt = (max) => Math.floor(Math.random() * Math.floor(max + 1));

const extractPlan = (content) => {
  if (!content.plan_id && !content.plans[0].plan)
    throw new Error('Invalid content');

  return content.plan_id ? content : content.plans[0].plan;
};

describe('Plan tester', () => {

  let metrics;
  let measures = [];

  before(() => {
    const file = process.env.TEST_PLAN || `${__dirname}/test-metering-plan.json`;

    console.log('   Loading plan %s ...', file);
    const fileContent = JSON.parse(fs.readFileSync(file, 'utf8'));
    const plan = extractPlan(fileContent);

    console.log('   Compiling plan ...');
    const compiledPlan = meteringConfig.compile(plan);
    delete compiledPlan.source;

    console.log('   Using max value %d and %d retries', maxValue, retries);

    console.log('   Loaded plan %s\n', colorize(compiledPlan));

    metrics = compiledPlan.metrics;

    compiledPlan.measures.forEach((measure) => measures.push(measure.name));
    console.log('      Detected %j measures', measures);
  });

  const containsMeasure = (metric, measureName) => {
    if (!metric.meter && metric.name === measureName) {
      console.log('      Found measure "%s" in metric "%s" (default function)', measureName, metric.name);
      return true;
    }

    if (metric.meter && metric.meter.indexOf(measureName) !== -1) {
      console.log('      Found measure "%s" in metric "%s"', measureName, metric.name);
      return true;
    }

    return false;
  };

  it('uses all measures', () => {
    const measuresFound = new Set();

    measures.forEach((measure) => {
      metrics.forEach((metric) => {
        if (containsMeasure(metric, measure))
          measuresFound.add(measure);
      });
    });

    expect([...measuresFound]).to.deep.equal(measures);
  });

  const checkPlanFlow = (measure, metric, previousValue, opts = {}) => {
    if (!opts.noLogs) console.log('       Testing metric "%s" ...', metric.name);

    const meterOutput = metric.meterfn(measure);
    if (!opts.noLogs)
      console.log('          meter(%s) = %s',
        colorize(measure),
        colorize(meterOutput)
      );
    // eslint-disable-next-line no-unused-expressions
    expect(new BigNumber(meterOutput).toNumber()).to.exist;

    const nextValue = {};

    const accumulateOutput = metric.accumulatefn(
      previousValue.accumulated.accumulator,
      meterOutput
    );
    if (!opts.noLogs)
      console.log('          accumulate(%s, %s) = %s',
        colorize(previousValue.accumulated.accumulator),
        colorize(meterOutput),
        colorize(accumulateOutput)
      );
    nextValue.accumulated = {
      accumulator: accumulateOutput
    };

    const aggregateOutput = metric.aggregatefn(
      previousValue.aggregated.aggregator,
      previousValue.aggregated.previous,
      accumulateOutput
    );
    if (!opts.noLogs)
      console.log('          aggregate(%s, %s, %s) = %s',
        colorize(previousValue.aggregated.aggregator),
        colorize(previousValue.aggregated.previous),
        colorize(accumulateOutput),
        colorize(aggregateOutput)
      );
    nextValue.aggregated = {
      aggregator: aggregateOutput,
      previous: previousValue.aggregated.aggregator
    };

    const aggregateResult = new BigNumber(aggregateOutput).toNumber();
    const aggregateOutputMsg = 'AggregateOutput is ' + aggregateOutput;
    // eslint-disable-next-line no-unused-expressions
    expect(aggregateResult, aggregateOutputMsg).not.to.be.NaN;
    // eslint-disable-next-line no-unused-expressions
    expect(aggregateResult, aggregateOutputMsg).not.to.be.undefined;
    // eslint-disable-next-line no-unused-expressions
    expect(aggregateResult, aggregateOutputMsg).not.to.be.null;

    const summarizeOutput = metric.summarizefn(
      previousValue.summarized.total,
      aggregateOutput
    );
    if (!opts.noLogs)
      console.log('          summarize(%s, %s) = %s',
        colorize(previousValue.summarized.total),
        colorize(aggregateOutput),
        colorize(summarizeOutput)
      );
    // eslint-disable-next-line no-unused-expressions
    expect(new BigNumber(summarizeOutput).toNumber()).to.exist;
    nextValue.summarized = {
      total: summarizeOutput
    };

    return nextValue;
  };

  context('on initial accumulation/aggregation', () => {
    const measureFake = {};

    before(() => {
      measures.forEach((measure) => {
        measureFake[measure] = randomInt(maxValue);
      });
    });

    it('works correctly', () => {
      metrics.forEach((metric) =>
        checkPlanFlow(measureFake, metric, {
          accumulated: {
            accumulator: 0
          },
          aggregated: {
            aggregator: undefined,
            previous: undefined
          },
          summarized: {
            total: undefined
          }
        })
      );
    });
  });

  context('with already accumulated/aggregated values', () => {
    const measureFake = {};
    const initial = {};

    before(() => {
      measures.forEach((measure) => {
        measureFake[measure] = randomInt(maxValue);
      });

      metrics.forEach((metric) => {
        const metricName = metric.name;
        console.log('       Setting up metric "%s" ...', metricName);
        initial[metricName] = {};

        initial[metricName].meter = metric.meterfn(measureFake);
        console.log('          meter(%s) = %s',
          colorize(measureFake),
          colorize(initial[metricName].meter)
        );
        // eslint-disable-next-line no-unused-expressions
        expect(new BigNumber(initial[metricName].meter).toNumber()).to.exist;

        initial[metricName].accumulate = metric.accumulatefn(0, initial[metricName].meter);
        console.log('          accumulate(0, %s) = %s',
          colorize(initial[metricName].meter),
          colorize(initial[metricName].accumulate)
        );

        initial[metricName].aggregate = metric.aggregatefn(undefined, undefined, initial[metricName].accumulate);
        console.log('          aggregate(%s) = %s',
          colorize(initial[metricName].accumulate),
          colorize(initial[metricName].aggregate)
        );

        initial[metricName].summarize = metric.summarizefn(undefined, initial[metricName].aggregate);
        console.log('          summarize(%s) = %s',
          colorize(initial[metricName].aggregate),
          colorize(initial[metricName].summarize)
        );
        // eslint-disable-next-line no-unused-expressions
        expect(new BigNumber(initial[metricName].summarize).toNumber()).to.exist;
      });
    });

    it('works when there are accumulated/aggregated values' , () => {
      metrics.forEach((metric) => {
        const metricName = metric.name;
        checkPlanFlow(measureFake, metric, {
          accumulated: {
            accumulator: initial[metricName].accumulate
          },
          aggregated: {
            aggregator: initial[metricName].aggregate,
            previous: initial[metricName].aggregate
          },
          summarized: {
            total: initial[metricName].summarize
          }
        });
      });
    });
  });

  context('on continuous accumulation/aggregation', () => {
    const measureFake = {};
    const step = {};

    const generateMeasure = () => {
      measures.forEach((measure) => {
        measureFake[measure] = randomInt(maxValue);
      });
    };

    before(() => {
      metrics.forEach((metric) => {
        const metricName = metric.name;
        step[metricName] = {
          accumulated: {
            accumulator: 0
          },
          aggregated: {
            aggregator: undefined,
            previous: undefined
          },
          summarized: {
            total: undefined
          }
        };
      });
    });

    it('works correctly', () => {
      for(let i = 1; i <= retries; i++) {
        console.log('\n       Step %d/%d ...', i, retries);
        generateMeasure();
        metrics.forEach((metric) => {
          const metricName = metric.name;
          step[metricName] = checkPlanFlow(measureFake, metric, step[metricName]);
        });
      }
    });
  });

});
