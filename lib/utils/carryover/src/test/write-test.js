'use strict';

/* eslint no-unused-expressions: 0 */

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const map = _.map;
const memoize = _.memoize;

// Configure API and COLLECTOR URLs
process.env.API = 'http://api';
process.env.COLLECTOR = 'http://collector';

const urienv = require('abacus-urienv');

// Resolve service URIs
const uris = memoize(() => urienv({
  api      : 80,
  collector: 9080,
  db       : 5984
}));

describe('Write carry-over usage', () => {
  let dbEnv;
  let carryOver;
  let getMock;
  let putMock;
  let dbclient;
  let statistics;
  let errorFn;

  const deleteModules = (cb = () => {}) => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-batch')];
    delete require.cache[require.resolve('abacus-breaker')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-paging')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-retry')];
    delete require.cache[require.resolve('abacus-throttle')];
    delete require.cache[require.resolve('abacus-yieldable')];
    delete require.cache[require.resolve('..')];

    cb();
  };

  before(() => {
    dbEnv = process.env.DB;

    // Configure test db URL prefix
    process.env.DB = process.env.DB || 'test';
  });

  after(() => {
    process.env.DB = dbEnv;
  });

  beforeEach(() => {
    deleteModules();

    // Mock the cluster module
    const cluster = require('abacus-cluster');
    require.cache[require.resolve('abacus-cluster')].exports =
      extend((app) => app, cluster);

    // Disable the batch, retry, breaker and throttle modules
    require('abacus-batch');
    require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
    require('abacus-retry');
    require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    // Mock the dbclient module
    dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    dbclientModule.exports = extend(() => {
      return {
        fname: 'test-mock',
        get: getMock,
        put: putMock
      };
    }, dbclient);

    statistics = {
      carryOver: {
        getSuccess   : 0,
        getNotFound  : 0,
        getFailure   : 0,
        removeSuccess: 0,
        removeFailure: 0,
        upsertSuccess: 0,
        upsertFailure: 0,
        readSuccess  : 0,
        readFailure  : 0,
        docsRead     : 0
      }
    };
    errorFn = spy();
  });

  afterEach(() => {
    deleteModules();
  });

  const appUsage = [{
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff0f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff0f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff0f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff0f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 1073741824
      },
      {
        measure: 'previous_running_instances',
        quantity: 2
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff1f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff1f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
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
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff1f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff1f',
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
        quantity: 536870912
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff2f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff2f',
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 536870912
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
    ]
  }, {
    start: 1439897300000,
    end: 1439897300000,
    organization_id: 'e8139b76-e829-4af3-b332-87316b1c0a6c',
    space_id: 'a7e44fcd-25bf-4023-8a87-03fba4882995',
    consumer_id: 'app:35c4ff0f',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 'memory:35c4ff0f',
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
        quantity: 536870912
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ]
  }];

  const checkId = (doc, id, time) => {
    const content = doc[0]._id ? doc[0]._id : doc[0];
    expect(content).to.equal(dbclient.tkuri(
      util.format('e8139b76-e829-4af3-b332-87316b1c0a6c/' +
        'a7e44fcd-25bf-4023-8a87-03fba4882995/app:%s/linux-container/' +
        'standard/memory:%s', id, id), time)
    );
  };

  const checkPutDocument = (doc, id, time, guid, state) => {
    checkId(doc, id, time);
    expect(doc[0].collector_id).to.equal('t/20161010/k/anonymous');
    expect(doc[0].event_guid).to.equal(guid);
    expect(doc[0].state).to.equal(state);
  };

  const usageResponse = {
    statusCode: 201,
    body: {},
    headers: {
      location: uris().collector +
      '/v1/metering/collected/usage/t/20161010/k/anonymous'
    }
  };

  const guid = 'acc4ff0f';
  const state = 'STARTED';

  context('on success', () => {

    beforeEach((done) => {
      getMock = spy((key, cb) => {
        cb(undefined, {});
      });
      putMock = spy((doc, cb) => {
        cb(undefined, {});
      });

      let count = 0;
      const countingCb = (error) => {
        if (error)
          done(error);
        if (++count === appUsage.length)
          done();
      };

      carryOver = require('..')(statistics, errorFn);

      map(appUsage, (usage) => {
        carryOver.write(usage, usageResponse, guid, state,
          (opError) => {
            assert.notCalled(errorFn);
            countingCb(opError);
          });
      });
    });

    it('tries to get the document revisions from the DB', () => {
      const getArgs = getMock.args;
      expect(getArgs.length).to.equal(6);
      checkId(getArgs[0], '35c4ff0f', 1438387200000);
      checkId(getArgs[1], '35c4ff0f', 1438387200000);
      checkId(getArgs[2], '35c4ff1f', 1438387200000);
      checkId(getArgs[3], '35c4ff1f', 1438387200000);
      checkId(getArgs[4], '35c4ff2f', 1438387200000);
      checkId(getArgs[5], '35c4ff0f', 1438387200000);
    });

    it('stores correct documents in the DB', () => {
      const putArgs = putMock.args;
      expect(putArgs.length).to.equal(6);
      checkPutDocument(putArgs[0], '35c4ff0f', 1438387200000, guid, state);
      checkPutDocument(putArgs[1], '35c4ff0f', 1438387200000, guid, state);
      checkPutDocument(putArgs[2], '35c4ff1f', 1438387200000, guid, state);
      checkPutDocument(putArgs[3], '35c4ff1f', 1438387200000, guid, state);
      checkPutDocument(putArgs[4], '35c4ff2f', 1438387200000, guid, state);
      checkPutDocument(putArgs[5], '35c4ff0f', 1438387200000, guid, state);
    });

    it('populates statistics object', () => {
      expect(statistics.carryOver).to.deep.equal({
        getSuccess: 6,
        getNotFound: 0,
        getFailure: 0,
        removeSuccess: 0,
        removeFailure: 0,
        upsertSuccess: 6,
        upsertFailure: 0,
        readSuccess: 0,
        readFailure: 0,
        docsRead: 0
      });
    });
  });

  context('on failure', () => {
    context('when new app cannot be read', () => {
      const testError = new Error('test error');

      beforeEach((done) => {
        getMock = spy((key, cb) => {
          cb(key.indexOf('35c4ff1f') > 0 ? testError : undefined, {});
        });
        putMock = spy((doc, cb) => {
          cb(undefined, {});
        });

        let count = 0;
        const countingCb = () => {
          if (++count === appUsage.length)
            done();
        };

        carryOver = require('..')(statistics, errorFn);
        map(appUsage, (usage) => {
          carryOver.write(usage, usageResponse,
            undefined, undefined, countingCb);
        });
      });

      it('tries to get the documents revisions from the DB', () => {
        const getArgs = getMock.args;
        expect(getArgs.length).to.equal(6);
        checkId(getArgs[0], '35c4ff0f', 1438387200000);
        checkId(getArgs[1], '35c4ff0f', 1438387200000);
        checkId(getArgs[2], '35c4ff1f', 1438387200000);
        checkId(getArgs[3], '35c4ff1f', 1438387200000);
        checkId(getArgs[4], '35c4ff2f', 1438387200000);
        checkId(getArgs[5], '35c4ff0f', 1438387200000);
      });

      it('stores documents we could get in the DB', () => {
        const putArgs = putMock.args;
        expect(putArgs.length).to.equal(4);
        checkPutDocument(putArgs[0], '35c4ff0f', 1438387200000);
        checkPutDocument(putArgs[1], '35c4ff0f', 1438387200000);
        checkPutDocument(putArgs[2], '35c4ff2f', 1438387200000);
        checkPutDocument(putArgs[3], '35c4ff0f', 1438387200000);
      });

      it('populates statistics object', () => {
        expect(statistics.carryOver).to.deep.equal({
          getSuccess: 4,
          getNotFound: 0,
          getFailure: 2,
          removeSuccess: 0,
          removeFailure: 0,
          upsertSuccess: 4,
          upsertFailure: 0,
          readSuccess: 0,
          readFailure: 0,
          docsRead: 0
        });
      });

      it('calls error function', () => {
        expect(errorFn.callCount).to.equal(2);
        assert.alwaysCalledWith(errorFn,
          'Error getting carry-over usage',
          testError, undefined, 'carryOver');
      });
    });

    context('when new app cannot be stored', () => {
      const testError = new Error('test error');

      beforeEach((done) => {
        getMock = spy((doc, cb) => {
          cb(undefined, {});
        });
        putMock = spy((doc, cb) => {
          cb(doc._id.indexOf('35c4ff1f') > 0 ? testError : undefined, {});
        });

        let count = 0;
        const countingCb = () => {
          if (++count === appUsage.length)
            done();
        };

        carryOver = require('..')(statistics, errorFn);
        map(appUsage, (usage) => {
          carryOver.write(usage, usageResponse,
            undefined, undefined, countingCb);
        });
      });

      it('tries to get the documents revisions from the DB', () => {
        const getArgs = getMock.args;
        expect(getArgs.length).to.equal(6);
        checkId(getArgs[0], '35c4ff0f', 1438387200000);
        checkId(getArgs[1], '35c4ff0f', 1438387200000);
        checkId(getArgs[2], '35c4ff1f', 1438387200000);
        checkId(getArgs[3], '35c4ff1f', 1438387200000);
        checkId(getArgs[4], '35c4ff2f', 1438387200000);
        checkId(getArgs[5], '35c4ff0f', 1438387200000);
      });

      it('stores documents we could get in the DB', () => {
        const putArgs = putMock.args;
        expect(putArgs.length).to.equal(6);
        checkPutDocument(putArgs[0], '35c4ff0f', 1438387200000);
        checkPutDocument(putArgs[1], '35c4ff0f', 1438387200000);
        checkPutDocument(putArgs[2], '35c4ff1f', 1438387200000);
        checkPutDocument(putArgs[3], '35c4ff1f', 1438387200000);
        checkPutDocument(putArgs[4], '35c4ff2f', 1438387200000);
        checkPutDocument(putArgs[5], '35c4ff0f', 1438387200000);
      });

      it('populates statistics object', () => {
        expect(statistics.carryOver).to.deep.equal({
          getSuccess   : 6,
          getNotFound  : 0,
          getFailure   : 0,
          removeSuccess: 0,
          removeFailure: 0,
          upsertSuccess: 4,
          upsertFailure: 2,
          readSuccess  : 0,
          readFailure  : 0,
          docsRead     : 0
        });
      });

      it('calls error function', () => {
        expect(errorFn.callCount).to.equal(2);
        assert.alwaysCalledWith(errorFn,
          'Error upserting carry-over usage',
          testError, undefined, 'carryOver');
      });
    });
  });

  context('with a event for a known app', () => {
    const newResourceState = 'new_state';

    beforeEach((done) => {
      getMock = spy((key, cb) => {
        cb(undefined, {
          _id: 'id',
          collector_id: 't/20161010/k/anonymous',
          state: 'old_state',
          timestamp: 1439897300000
        });
      });
      putMock = spy((doc, cb) => {
        cb(undefined, {});
      });

      carryOver = require('..')(statistics, errorFn);
      carryOver.write(appUsage[0], usageResponse, undefined, newResourceState,
        (opError) => {
          expect(opError).to.be.undefined;
          assert.notCalled(errorFn);
          done();
        });
    });

    it('the event info is updated in the DB', () => {
      const putArgs = putMock.args;
      expect(putArgs.length).to.equal(1);
      expect(putArgs[0][0].state).to.equal(newResourceState);
      expect(putArgs[0][0].timestamp).to.equal(appUsage[0].start);
    });

    it('populates statistics object', () => {
      expect(statistics.carryOver).to.deep.equal({
        getSuccess   : 1,
        getNotFound  : 0,
        getFailure   : 0,
        removeSuccess: 0,
        removeFailure: 0,
        upsertSuccess: 1,
        upsertFailure: 0,
        readSuccess  : 0,
        readFailure  : 0,
        docsRead     : 0
      });
    });
  });

  context('when working with the DB', () => {
    const timeout = 64;
    const sandbox = sinon.sandbox.create();
    const clock = sandbox.useFakeTimers();

    const checkForTimeoutError = () => {
      const cbSpy = spy();

      carryOver = require('..')(statistics, errorFn);
      carryOver.write(appUsage[0], usageResponse, guid, state, cbSpy);

      clock.tick(2 * timeout);

      assert.calledOnce(cbSpy);
      expect(cbSpy.firstCall.args[0])
        .to.be.instanceOf(require('abacus-breaker').TimeoutError);
    };

    after(() => {
      sandbox.restore();
    });

    beforeEach(() => {
      process.env.BREAKER_TIMEOUT = timeout;
    });

    it('should timeout when getting a document', () => {
      getMock = stub().callsFake((key, cb) =>
        setTimeout(() => cb(), 3 * timeout));;

      checkForTimeoutError();
    });

    it('should timeout when writing a document', () => {
      getMock = stub().yields();
      putMock = stub().callsFake((doc, cb) =>
        setTimeout(() => cb(), 3 * timeout));;

      checkForTimeoutError();
    });
  });
});
