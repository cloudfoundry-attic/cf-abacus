'use strict';

const cp = require('child_process');
const util = require('util');

const _ = require('underscore');
const clone = _.clone;
const extend = _.extend;
const memoize = _.memoize;
const times = _.times;

const moment = require('moment');

const partition = require('abacus-partition');
const request = require('abacus-request');
const urienv = require('abacus-urienv');

// Resolve service URIs
const uris = memoize(() => urienv({
  db: 5984
}));

// Setup the debug log
const debug =
  require('abacus-debug')('abacus-cf-renewer-paging-test');

const tests = (secured) => {
  let reqMock;
  let renewer;
  let dbclient;

  const systemToken = () => 'token';

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-cf-renewer')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-partition')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];

    cb();
  };

  // Module directory
  const moduleDir = (module) => {
    const path = require.resolve(module);
    return path.substr(0, path.indexOf(module + '/') + module.length);
  };

  const start = (module, cb) => {
    debug('Starting %s in directory %s', module, moduleDir(module));
    const c = cp.spawn('npm', ['run', 'start'], {
      cwd: moduleDir(module),
      env: clone(process.env)
    });

    // Add listeners to stdout, stderr and exit message and forward the
    // messages to debug logs
    c.stdout.on('data', (data) => process.stdout.write(data));
    c.stderr.on('data', (data) => process.stderr.write(data));
    c.on('exit', (code) => {
      debug('Module %s started with code %d', module, code);
      cb(module, code);
    });
  };

  const stop = (module, cb) => {
    debug('Stopping %s in directory %s', module, moduleDir(module));
    const c = cp.spawn('npm', ['run', 'stop'],
      { cwd: moduleDir(module), env: clone(process.env) });

    // Add listeners to stdout, stderr and exit message and forward the
    // messages to debug logs
    c.stdout.on('data', (data) => process.stdout.write(data));
    c.stderr.on('data', (data) => process.stderr.write(data));
    c.on('exit', (code) => cb(module, code));
  };

  before((done) => {
    // Start local database server
    if (!process.env.DB)
      start('abacus-pouchserver', (module, code) => {
        if (code === 0)
          request.waitFor(uris().db, {}, 5000, (err) => {
            done(err);
          });
        else
          done(new Error('Cannot start pouchDB. Exit code ' + code));
      });
    else
      done();
  });

  after((done) => {
    stop('abacus-pouchserver', (module, code) => {
      if (code === 0)
        done();
      else
        done(new Error('Cannot stop pouchDB. Exit code ' + code));
    });
  });

  beforeEach((done) => {
    deleteModules();

    // Configure URLs
    process.env.AUTH_SERVER = 'http://api';
    process.env.COLLECTOR = 'http://collector';
    process.env.PROVISIONING = 'http://provisioning';

    process.env.SECURED = secured ? 'true' : 'false';
    process.env.PAGE_SIZE = '10';

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    // Delete test dbs on the configured db server
    dbclient = require('abacus-dbclient');
    dbclient.drop(process.env.DB ? process.env.DB : uris().db,
      /^abacus-/, () => {
        done();
      });
  });

  afterEach(() => {
    if (renewer)
      renewer.stopRenewer();

    deleteModules();

    // Unset the env variables
    delete process.env.AUTH_SERVER;
    delete process.env.COLLECTOR;
    delete process.env.PROVISIONING;
    delete process.env.SECURED;
    delete process.env.PAGE_SIZE;

    reqMock = undefined;
    renewer = undefined;
    dbclient = undefined;
  });

  const previousMonthStart = moment().utc().subtract(1, 'months').
    startOf('month').valueOf();
  const thisMonthStart = moment().utc().startOf('month').valueOf();

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: guid });
  };

  const checkDocuments = (db, num, done) => {
    db.allDocs({
      include_docs: false,
      startkey: 't/' + dbclient.pad16(previousMonthStart),
      endkey: 't/' + dbclient.pad16(thisMonthStart),
      limit: num
    }, (err, docs) => {
      debug('Found %d documents in db', docs ? docs.rows.length : 0);
      if (docs && docs.rows.length === num)
        done();
      else
        setTimeout(() => checkDocuments(db, num, done), 1000);
    });
  };

  const buildDbDocs = (num, done) => {
    const dbDocs = times(num, (n) => ({
      id: dbclient.tkuri(util.format('app:%d', n), previousMonthStart),
      collector_id: util.format('%d', n)
    }));

    const checkKeyPart = partition.partitioner(partition.bucket,
      partition.period, partition.forward, partition.balance, true);
    const carryOverDB = dbclient(checkKeyPart,
      dbclient.dburi(uris().db, 'abacus-carry-over'));

    debug('Storing %d documents to DB', dbDocs.length);

    carryOverDB.bulkDocs(dbDocs, {}, (err, docs) => {
      expect(err).to.equal(null);
      expect(docs).to.not.equal(undefined);
      expect(docs.length).to.equal(dbDocs.length);
    });

    checkDocuments(carryOverDB, num, done);
  };

  const appUsage = {
    start: 1476878391000,
    end: 1476878391000,
    organization_id: '1',
    space_id: '2',
    resource_id: 'linux-container',
    plan_id: 'basic',
    consumer_id: 'app:1fb61c1f-2db3-4235-9934-00097845b80d',
    resource_instance_id: '1fb61c1f-2db3-4235-9934-00097845b80d',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 512
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
    processed_id: '0001476878403858-0-0-1-0',
    processed: 1476878403858,
    id: 't/0001476878403858-0-0-1-0/k/anonymous'
  };

  context('with usage in the database', () => {

    context('with usage multiple of paging size', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqMock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(appUsage, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqMock;

        buildDbDocs(200, () => {
          renewer = require('abacus-cf-renewer');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %j and response %j', error, response)));
            },
            success: () => {
              renewer.stopRenewer();
              done();
            }
          });
        });
      });

      it('accesses the DB with paging', () => {
        expect(renewer.statistics.db.docsRead).to.equal(200);
        expect(renewer.statistics.db.readSuccess).to.equal(21);
        expect(renewer.statistics.db.readFailure).to.equal(0);
      });
    });

    context('with usage that is not multiple of paging size', () => {
      beforeEach((done) => {
        // Mock the request module
        const request = require('abacus-request');
        reqMock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(undefined, {
              statusCode: 200,
              body: changeOrgId(appUsage, opts.usage_id)
            });
          }),
          post: spy((uri, opts, cb) => {
            cb(null, { statusCode: 201, body: {} });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqMock;

        buildDbDocs(197, () => {
          renewer = require('abacus-cf-renewer');
          renewer.renewUsage(systemToken, {
            failure: (error, response) => {
              renewer.stopRenewer();
              done(new Error(util.format('Unexpected call of failure with ' +
                'error %j and response %j', error, response)));
            },
            success: () => {
              renewer.stopRenewer();
              done();
            }
          });
        });
      });

      it('accesses the DB with paging', () => {
        expect(renewer.statistics.db.docsRead).to.equal(197);
        expect(renewer.statistics.db.readSuccess).to.equal(20);
        expect(renewer.statistics.db.readFailure).to.equal(0);
      });
    });

  });

  context('without usage', () => {
    beforeEach((done) => {
      // Mock the request module
      const request = require('abacus-request');
      reqMock = extend({}, request, {
        get: spy((uri, opts, cb) => {
          cb(undefined, {
            statusCode: 200,
            body: changeOrgId(appUsage, opts.usage_id)
          });
        }),
        post: spy((uri, opts, cb) => {
          cb(null, { statusCode: 201, body: {} });
        })
      });
      require.cache[require.resolve('abacus-request')].exports = reqMock;

      renewer = require('abacus-cf-renewer');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          renewer.stopRenewer();
          done(new Error(util.format('Unexpected call of failure with ' +
            'error %j and response %j', error, response)));
        },
        success: () => {
          renewer.stopRenewer();
          done();
        }
      });
    });

    it('accesses the DB only once', () => {
      expect(renewer.statistics.db.readSuccess).to.equal(1);
      expect(renewer.statistics.db.readFailure).to.equal(0);
      expect(renewer.statistics.db.docsRead).to.equal(0);
    });
  });

  context('on error accessing db', () => {
    beforeEach(() => {
      // Mock the dbclient module
      const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
      dbclientModule.exports = extend(() => {
        return {
          fname: 'test-mock',
          allDocs: (opt, cb) => cb('expected db error', { rows: [] })
        };
      }, dbclient);
    });

    it('fails', (done) => {
      renewer = require('abacus-cf-renewer');
      renewer.renewUsage(systemToken, {
        failure: (error, response) => {
          renewer.stopRenewer();
          expect(error).to.equal('expected db error');
          expect(renewer.statistics.db.readSuccess).to.equal(0);
          expect(renewer.statistics.db.readFailure).to.equal(1);
          expect(renewer.statistics.db.docsRead).to.equal(0);
          done();
        },
        success: () => {
          renewer.stopRenewer();
          done(new Error(util.format('Unexpected call of success')));
        }
      });
    });
  });

};

describe('Usage paging without security', () => tests(false));

describe('Usage paging with security', () => tests(true));
