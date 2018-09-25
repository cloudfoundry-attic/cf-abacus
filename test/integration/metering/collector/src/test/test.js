'use strict';

const execute = require('abacus-cmdline').execute;
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const dbclient = require('abacus-dbclient');
const createLifecycleManager = require('abacus-lifecycle-manager');
const { ConnectionManager, Consumer, amqpMessageParser } = require('abacus-rabbitmq');
const { checkCorrectSetup } = require('abacus-test-helper');

const { map, range, omit, extend } = require('underscore');

const debug = require('abacus-debug')('abacus-usage-collector-integration-test');

const env = {
  orgs: process.env.ORGS || 1,
  resourceInstances: process.env.INSTANCES || 1,
  usage: process.env.USAGE_DOCS || 1,
  tshift: process.env.DAY * 24 * 60 * 60 * 1000 || 0,
  startTimeout: process.env.START_TIMEOUT || 30000,
  totalTimeout: process.env.TOTAL_TIMEOUT || 60000,
  rabbitUri: process.env.RABBIT_URI
};

const consumerConfig = {
  mainQueue: {
    name: 'collector-itest-queue',
    exchange: 'collector-itest-main-exchange',
    routingKey: '#',
    prefetchLimit: 100
  },
  deadLetterQueues: [
    {
      name: 'collector-itest-first-dl',
      exchange: 'collector-itest-first-dl-exchange',
      mainExchange: 'collector-itest-main-exchange',
      routingKey: '#',
      ttl: 180000,
      retryAttempts: 100
    },
    {
      name: 'collector-itest-second-dl',
      exchange: 'collector-itest-second-dl-exchange',
      mainExchange: 'collector-itest-main-exchange',
      routingKey: '#',
      ttl: 1620000,
      retryAttempts: 100
    }
  ]
};

const customEnv = extend({}, process.env, { ABACUS_COLLECT_QUEUE:  consumerConfig.mainQueue.name });
const lifecycleManager = createLifecycleManager().useEnv(customEnv);

describe('collector integration test', () => {
  before(() => {
    checkCorrectSetup(env);
    const modules = [
      lifecycleManager.modules.eurekaPlugin,
      lifecycleManager.modules.provisioningPlugin,
      lifecycleManager.modules.accountPlugin,
      lifecycleManager.modules.collector
    ];

    // drop all abacus collections except plans and plan-mappings
    dbclient.drop(process.env.DB_URI, /^abacus-((?!plan).)*$/, () => {
      lifecycleManager.startModules(modules);
    });
  });

  after(() => {
    lifecycleManager.stopAllStarted();
  });

  // Initialize usage doc properties with unique values
  const start = 1435629365220 + env.tshift;
  const end = 1435629465220 + env.tshift;

  const oid = (o) => ['a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', o + 1].join('-');
  const sid = (o, ri) => ['aaeae239-f3f8-483c-9dd0-de5d41c38b6a', o + 1].join('-');
  const cid = (o, ri) => ['bbeae239-f3f8-483c-9dd0-de6781c38bab', o + 1].join('-');
  const pid = (ri, u) => 'basic';

  const riid = (o, ri) => ['0b39fa70-a65f-4183-bae8-385633ca5c87', o + 1, ri + 1].join('-');

  // Measured usage for a given org, resource instance and usage #s
  const measuredTemplate = (o, ri, u) => ({
    start: start + u,
    end: end + u,
    organization_id: oid(o),
    space_id: sid(o, ri),
    resource_id: 'test-resource',
    plan_id: pid(ri, u),
    resource_instance_id: riid(o, ri),
    consumer_id: cid(o, ri),
    measured_usage: [
      { measure: 'storage', quantity: 1073741824 },
      { measure: 'light_api_calls', quantity: 1000 },
      { measure: 'heavy_api_calls', quantity: 100 }
    ]
  });

  const storeDefaults = () => {
    const storeDefaultsOperation = 'store-default-plans && store-default-mappings';
    execute(storeDefaultsOperation);
  };

  // Post a measured usage doc, throttled to default concurrent requests
  let usageDocs = new Map();
  const post = throttle((o, ri, u, cb) => {
    const usageDoc = measuredTemplate(o, ri, u);
    usageDocs.set(`${usageDoc.resource_instance_id}${usageDoc.end}`, usageDoc);
    debug('Submit measured usage %o for org %d instance %d usage %d', usageDoc, o + 1, ri + 1, u + 1);
    request.post('http://localhost::p/v1/metering/collected/usage', { p: 9080, body: usageDoc }, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.statusCode).to.equal(202);
      expect(val.headers.location).to.not.equal(undefined);
      debug('POSTed measured usage for org %d instance %d' + ' usage %d', o + 1, ri + 1, u + 1);
      cb();
    });
  });

  const submit = (cb) =>
    map(range(env.usage), (u) => map(range(env.resourceInstances), (ri) =>
      map(range(env.orgs), (o) => post(o, ri, u, cb))));

  const submitUsage = (cb) => {
    request.waitFor('http://localhost::p/batch', { p: 9080 }, env.startTimeout, (err, value) => {
      if (err) throw err;
      submit(cb);
    });
  };

  const verify = (expectedMessages, cb) => {
    let messageCount = 0;
    const countMessages = () => {
      if (++messageCount === expectedMessages)
        cb();
    };

    const handle = (usage) => {
      debug('Read doc %o from message queue', usage);
      const msg = usage.usageDoc;
      expect(usageDocs.get(msg.resource_instance_id + msg.end)).to.deep.equal(
        omit(msg, 'id', 'processed', 'processed_id', 'collected_usage_id'));
      usageDocs.delete(`${msg.resource_instance_id}${msg.end}`);
      countMessages();
    };

    const connectionManager = new ConnectionManager([env.rabbitUri]);

    debug('Creating consumer ...');
    const consumer = new Consumer(connectionManager, amqpMessageParser, consumerConfig);
    consumer.process({ handle: handle });
  };

  it('collect measured usage submissions', function(done) {
    // Configure the test timeout based on the number of usage docs or predefined timeout
    const timeout = Math.max(env.totalTimeout, 100 * env.orgs * env.resourceInstances * env.usage);
    this.timeout(timeout + 2000);

    storeDefaults();
    submitUsage(() => {});
    setInterval(() => verify(env.orgs * env.resourceInstances * env.usage, done), 5000);
  });

});
