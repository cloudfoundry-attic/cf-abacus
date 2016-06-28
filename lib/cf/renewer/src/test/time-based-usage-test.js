'use strict';

const _ = require('underscore');
const extend = _.extend;

const yieldable = require('abacus-yieldable');

const tests = (secured) => {
  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];
  };

  const systemToken = () => 'token';

  beforeEach(() => {
    deleteModules();

    process.env.API = 'http://api';
    process.env.PROVISIONING = 'http://provisioning';
    process.env.SECURED = secured ? 'true' : 'false';

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry and breaker module
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
  });

  afterEach(() => {
    deleteModules();

    // Unset the SECURED variable
    delete process.env.SECURED;
  });

  const runningAppUsage = {
    _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    start: 1466510153965,
    end: 1466510153965,
    organization_id: 'us-south:1',
    space_id: '1',
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'basic',
    resource_instance_id: '1',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 1024
      },
      {
        measure: 'current_running_instances',
        quantity: 1
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ],
    id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    processed_id: '0001466510156211-0-0-1-0',
    processed: 1466510156210,
    resource_type: 'linux-container',
    account_id: '1234',
    pricing_country: 'USA',
    metering_plan_id: 'basic-linux-container',
    rating_plan_id: 'linux-rating-plan',
    pricing_plan_id: 'linux-pricing-basic',
    prices: {
      metrics: [
        {
          name: 'memory',
          price: 1
        }
      ]
    },
    collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
  };
  const stoppedAppUsage = {
    _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    start: 1466510153965,
    end: 1466510153965,
    organization_id: 'us-south:1',
    space_id: '1',
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'basic',
    resource_instance_id: '1',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 0
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 1024
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ],
    id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    processed_id: '0001466510156211-0-0-1-0',
    processed: 1466510156210,
    resource_type: 'linux-container',
    account_id: '1234',
    pricing_country: 'USA',
    metering_plan_id: 'basic-linux-container',
    rating_plan_id: 'linux-rating-plan',
    pricing_plan_id: 'linux-pricing-basic',
    prices: {
      metrics: [
        {
          name: 'memory',
          price: 1
        }
      ]
    },
    collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
  };
  const scaledAppUsage = {
    _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    start: 1466510153965,
    end: 1466510153965,
    organization_id: 'us-south:1',
    space_id: '1',
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'basic',
    resource_instance_id: '1',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 2048
      },
      {
        measure: 'current_running_instances',
        quantity: 2
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ],
    id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
    't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
    processed_id: '0001466510156211-0-0-1-0',
    processed: 1466510156210,
    resource_type: 'linux-container',
    account_id: '1234',
    pricing_country: 'USA',
    metering_plan_id: 'basic-linux-container',
    rating_plan_id: 'linux-rating-plan',
    pricing_plan_id: 'linux-pricing-basic',
    prices: {
      metrics: [
        {
          name: 'memory',
          price: 1
        }
      ]
    },
    collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
  };
  const usage = [ runningAppUsage, stoppedAppUsage, scaledAppUsage ];

  context('no time-based metrics plan', () => {
    let reqmock;
    let filterTimeBased;

    beforeEach(() => {
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, {
            statusCode: 200, body: {
              plan_id: 'basic-linux-container',
              metrics: [
                {
                  name: 'memory',
                  unit: 'GIGABYTE',
                  type: 'discrete'
                }
              ]
            }
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      filterTimeBased = require('..').filterTimeBasedUsage;
    });

    it('leaves no metrics', (done) => {
      yieldable.functioncb(function *() {
        return yield filterTimeBased(usage, systemToken);
      })((error, docs) => {
        expect(error).to.equal(null);
        expect(docs.length).to.equal(0);
        done();
      });
    });
  });

  context('only time-based metrics plans', () => {
    let reqmock;
    let filterTimeBased;

    beforeEach(() => {
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, {
            statusCode: 200, body: {
              plan_id: 'basic-linux-container',
              metrics: [
                {
                  name: 'memory',
                  unit: 'GIGABYTE',
                  type: 'time-based'
                }
              ]
            }
          });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      filterTimeBased = require('..').filterTimeBasedUsage;
    });

    it('leaves all metrics', (done) => {
      yieldable.functioncb(function *() {
        return yield filterTimeBased(usage, systemToken);
      })((error, docs) => {
        expect(error).to.equal(null);
        expect(docs.length).to.equal(3);
        done();
      });
    });
  });

  context('mixed discrete and time-based plans', () => {
    let reqmock;
    let filterTimeBased;
    let mixedPlansUsage;

    const discreteUsage = {
      _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
      't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
      start: 1466510153965,
      end: 1466510153965,
      organization_id: 'us-south:1',
      space_id: '1',
      consumer_id: 'app:1',
      resource_id: 'linux-container',
      plan_id: 'basic',
      resource_instance_id: '1',
      measured_usage: [
        {
          measure: 'storage',
          quantity: 1024
        }
      ],
      id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
      't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
      processed_id: '0001466510156211-0-0-1-0',
      processed: 1466510156210,
      resource_type: 'linux-container',
      account_id: '1234',
      pricing_country: 'USA',
      metering_plan_id: 'storage-linux-container',
      rating_plan_id: 'storage-linux-rating-plan',
      pricing_plan_id: 'storage-linux-pricing-basic',
      prices: {
        metrics: [
          {
            name: 'storage',
            price: 2
          }
        ]
      },
      collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
    };

    beforeEach(() => {
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          if (opts.metering_plan_id === 'basic-linux-container')
            cb(undefined, {
              statusCode: 200, body: {
                plan_id: 'basic-linux-container',
                metrics: [
                  {
                    name: 'memory',
                    unit: 'GIGABYTE',
                    type: 'time-based'
                  }
                ]
              }
            });
          else
            cb(undefined, {
              statusCode: 200, body: {
                plan_id: 'storage-linux-container',
                metrics: [
                  {
                    name: 'memory',
                    unit: 'GIGABYTE',
                    type: 'discrete'
                  }
                ]
              }
            });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      filterTimeBased = require('..').filterTimeBasedUsage;

      mixedPlansUsage = usage.concat(discreteUsage);
    });

    it('leaves only time-based metrics', (done) => {
      yieldable.functioncb(function *() {
        return yield filterTimeBased(mixedPlansUsage, systemToken);
      })((error, docs) => {
        expect(error).to.equal(null);
        expect(docs.length).to.equal(3);
        done();
      });
    });
  });

  context('plan with mixed discrete and time-based metrics', () => {
    let reqmock;
    let filterTimeBased;
    let mixedUsage;

    const complexUsage = {
      _id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
      't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
      start: 1466510153965,
      end: 1466510153965,
      organization_id: 'us-south:1',
      space_id: '1',
      consumer_id: 'app:1',
      resource_id: 'linux-container',
      plan_id: 'basic',
      resource_instance_id: '1',
      measured_usage: [
        {
          measure: 'current_instance_memory',
          quantity: 2048
        },
        {
          measure: 'current_running_instances',
          quantity: 2
        },
        {
          measure: 'previous_instance_memory',
          quantity: 0
        },
        {
          measure: 'previous_running_instances',
          quantity: 0
        },
        {
          measure: 'storage',
          quantity: 1024
        }
      ],
      id: 'k/anonymous/linux-container/basic/us-south:1/1/1/app:1/' +
      't/0001466510153965/0001466510153965/0001466510155834-0-0-1-0',
      processed_id: '0001466510156211-0-0-1-0',
      processed: 1466510156210,
      resource_type: 'linux-container',
      account_id: '1234',
      pricing_country: 'USA',
      metering_plan_id: 'complex-linux-container',
      rating_plan_id: 'complex-linux-rating-plan',
      pricing_plan_id: 'complex-linux-pricing-basic',
      prices: {
        metrics: [
          {
            name: 'memory',
            price: 1
          },
          {
            name: 'storage',
            price: 2
          }
        ]
      },
      collected_usage_id: 't/0001466510155834-0-0-1-0/k/anonymous'
    };

    beforeEach(() => {
      const request = require('abacus-request');
      reqmock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          if (opts.metering_plan_id === 'basic-linux-container')
            cb(undefined, {
              statusCode: 200, body: {
                plan_id: 'basic-linux-container',
                metrics: [
                  {
                    name: 'memory',
                    unit: 'GIGABYTE',
                    type: 'time-based'
                  }
                ]
              }
            });
          else
            cb(undefined, {
              statusCode: 200, body: {
                plan_id: 'complex-linux-container',
                metrics: [
                  {
                    name: 'memory',
                    unit: 'GIGABYTE',
                    type: 'time-based'
                  },
                  {
                    name: 'storage',
                    unit: 'MEGABYTE',
                    type: 'discrete'
                  }
                ]
              }
            });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqmock;

      filterTimeBased = require('..').filterTimeBasedUsage;

      mixedUsage = usage.concat(complexUsage);
    });

    it('filters out docs from plans with mixed type metrics', (done) => {
      yieldable.functioncb(function *() {
        return yield filterTimeBased(mixedUsage, systemToken);
      })((error, docs) => {
        expect(error).to.equal(null);
        expect(docs.length).to.equal(3);
        done();
      });
    });
  });

};

describe('Filter time-based usage without security', () => tests(false));

describe('Filter time-based usage with security', () => tests(true));
