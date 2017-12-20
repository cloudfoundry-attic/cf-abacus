'use strict';

const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const meteringConfig = require('abacus-metering-config');
const util = require('util');

const colorize = (t) => util.inspect(t, {
  showHidden: false,
  depth: null,
  colors: true,
  breakLength: process.stdout.columns
});

describe('Plan tester', () => {

  let metrics;
  let measures = [];

  before(() => {
    const file = process.env.TEST_PLAN || `${__dirname}/test-metering-plan.json`;

    console.log('   Loading plan %s ...', file);
    const plan = require(file);

    console.log('   Compiling plan ...');
    const compiledPlan = meteringConfig.compile(plan);
    delete compiledPlan.source;

    console.log('   Loaded plan %s', colorize(compiledPlan));

    metrics = compiledPlan.metrics;
    compiledPlan.measures.forEach((measure) => measures.push(measure.name));

    console.log();
  });

  const containsMeasure = (metric, measureName) => {
    if (!metric.meter && metric === measureName) {
      console.log('      Found measure "%s" in metric "%s" (default function)', measureName, metric.name);
      return true;
    }

    if (metric.meter.indexOf(measureName) !== -1) {
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

  const checkPlanFlow = (measure, metric, opts) => {
    console.log('        Testing metric "%s" ...', metric.name);

    const meterOutput = metric.meterfn(measure);
    console.log('           meter(%s) = %s',
      colorize(measure),
      colorize(meterOutput)
    );
    // eslint-disable-next-line no-unused-expressions
    expect(new BigNumber(meterOutput).toNumber()).to.exist;

    const accumulateOutput = metric.accumulatefn(opts.accumulated.initial, meterOutput);
    console.log('           accumulate(%s, %s) = %s',
      opts.accumulated.initial,
      colorize(meterOutput),
      colorize(accumulateOutput)
    );

    const aggregateOutput = metric.aggregatefn(opts.aggregated.initial, opts.aggregated.previous, accumulateOutput);
    console.log('           aggregate(%s, %s, %s) = %s',
      opts.aggregated.initial,
      opts.aggregated.previous,
      colorize(accumulateOutput),
      colorize(aggregateOutput)
    );

    const summarizeOutput = metric.summarizefn(opts.summarized.total, aggregateOutput);
    console.log('           summarize(%s, %s) = %s',
      opts.summarized.total,
      colorize(aggregateOutput),
      colorize(summarizeOutput)
    );
    // eslint-disable-next-line no-unused-expressions
    expect(new BigNumber(summarizeOutput).toNumber()).to.exist;
  };

  context('on initial accumulation/aggregation', () => {
    const measureFake = {};

    before(() => {
      measures.forEach((measure) => {
        measureFake[measure] = 5;
      });
    });

    it('works correctly', () => {
      metrics.forEach((metric) =>
        checkPlanFlow(measureFake, metric, {
          accumulated: {
            initial: 0
          },
          aggregated: {
            initial: undefined,
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
        measureFake[measure] = 5;
      });

      metrics.forEach((metric) => {
        console.log('        Setting up metric "%s" ...', metric.name);

        initial.meter = metric.meterfn(measureFake);
        console.log('           meter(%s) = %s', colorize(measureFake), colorize(initial.meter));
        // eslint-disable-next-line no-unused-expressions
        expect(new BigNumber(initial.meter).toNumber()).to.exist;

        initial.accumulate = metric.accumulatefn(undefined, initial.meter);
        console.log('           accumulate(%s) = %s', colorize(initial.meter), colorize(initial.accumulate));

        initial.aggregate = metric.aggregatefn(undefined, undefined, initial.accumulate);
        console.log('           aggregate(%s) = %s', colorize(initial.accumulate), colorize(initial.aggregate));

        initial.summarize = metric.summarizefn(undefined, initial.aggregate);
        console.log('           summarize(%s) = %s', colorize(initial.aggregate), colorize(initial.summarize));
        // eslint-disable-next-line no-unused-expressions
        expect(new BigNumber(initial.summarize).toNumber()).to.exist;
      });
    });

    it('works when there are accumulated/aggregated values' , () => {
      metrics.forEach((metric) =>
        checkPlanFlow(measureFake, metric, {
          accumulated: {
            initial: initial.accumulate
          },
          aggregated: {
            initial: initial.aggregate,
            previous: initial.aggregate
          },
          summarized: {
            total: initial.summarize
          }
        })
      );
    });
  });
});
