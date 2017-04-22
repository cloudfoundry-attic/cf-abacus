'use strict';

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
  let removeMock;
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
    require('abacus-breaker');
    require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
    require('abacus-throttle');
    require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

    // Mock the dbclient module
    dbclient = require('abacus-dbclient');
    const dbclientModule = require.cache[require.resolve('abacus-dbclient')];
    dbclientModule.exports = extend(() => {
      return {
        fname: 'test-mock',
        get: getMock,
        put: putMock,
        remove: removeMock
      };
    }, dbclient);

    statistics = {
      carryOver: {
        getSuccess: 0,
        getFailure: 0,
        removeSuccess: 0,
        removeFailure: 0,
        upsertSuccess: 0,
        upsertFailure: 0
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

  const checkPutDocumentRef = (doc, id, time) => {
    checkId(doc, id, time);
    expect(doc[0].collector_id).to.equal('t/20161010/k/anonymous');
  };

  const usageResponse = {
    statusCode: 201,
    body: {},
    headers: {
      location: uris().collector +
      '/v1/metering/collected/usage/t/20161010/k/anonymous'
    }
  };

  context('on success', () => {

    beforeEach((done) => {
      removeMock = spy((doc, cb) => {
        cb(undefined, {});
      });
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
        if (++count == appUsage.length)
          done();
      };

      carryOver = require('..')(statistics, errorFn);
      map(appUsage, (usage) => {
        carryOver.write(usage, usageResponse, (opError) => {
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

    it('stores references to the documents in the DB', () => {
      const putArgs = putMock.args;
      expect(putArgs.length).to.equal(4);
      checkPutDocumentRef(putArgs[0], '35c4ff0f', 1438387200000);
      checkPutDocumentRef(putArgs[1], '35c4ff0f', 1438387200000);
      checkPutDocumentRef(putArgs[2], '35c4ff1f', 1438387200000);
      checkPutDocumentRef(putArgs[3], '35c4ff2f', 1438387200000);
    });

    it('removes stopped apps from the DB', () => {
      const removeArgs = removeMock.args;
      expect(removeArgs.length).to.equal(2);
      checkId(removeArgs[0], '35c4ff1f', 1438387200000);
      checkId(removeArgs[1], '35c4ff0f', 1438387200000);
    });

    it('populates statistics object', () => {
      expect(statistics.carryOver.getSuccess).to.equal(6);
      expect(statistics.carryOver.getFailure).to.equal(0);
      expect(statistics.carryOver.removeSuccess).to.equal(2);
      expect(statistics.carryOver.removeFailure).to.equal(0);
      expect(statistics.carryOver.upsertSuccess).to.equal(4);
      expect(statistics.carryOver.upsertFailure).to.equal(0);
    });
  });

  context('on failure', () => {
    context('when new app cannot be read', () => {
      const testError = new Error('test error');

      beforeEach((done) => {
        removeMock = spy((doc, cb) => {
          cb(undefined, {});
        });
        getMock = spy((key, cb) => {
          cb(key.indexOf('35c4ff1f') > 0 ? testError : undefined, {});
        });
        putMock = spy((doc, cb) => {
          cb(undefined, {});
        });

        let count = 0;
        const countingCb = () => {
          if (++count == appUsage.length)
            done();
        };

        carryOver = require('..')(statistics, errorFn);
        map(appUsage,
          (usage) => carryOver.write(usage, usageResponse, countingCb));
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
        expect(putArgs.length).to.equal(3);
        checkPutDocumentRef(putArgs[0], '35c4ff0f', 1438387200000);
        checkPutDocumentRef(putArgs[1], '35c4ff0f', 1438387200000);
        checkPutDocumentRef(putArgs[2], '35c4ff2f', 1438387200000);
      });

      it('removes stopped apps from the DB', () => {
        const removeArgs = removeMock.args;
        expect(removeArgs.length).to.equal(1);
        checkId(removeArgs[0], '35c4ff0f', 1438387200000);
      });

      it('populates statistics object', () => {
        expect(statistics.carryOver.getSuccess).to.equal(4);
        expect(statistics.carryOver.getFailure).to.equal(2);
        expect(statistics.carryOver.removeSuccess).to.equal(1);
        expect(statistics.carryOver.removeFailure).to.equal(0);
        expect(statistics.carryOver.upsertSuccess).to.equal(3);
        expect(statistics.carryOver.upsertFailure).to.equal(0);
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
        removeMock = spy((doc, cb) => {
          cb(undefined, {});
        });
        getMock = spy((doc, cb) => {
          cb(undefined, {});
        });
        putMock = spy((doc, cb) => {
          cb(doc._id.indexOf('35c4ff1f') > 0 ? testError : undefined, {});
        });

        let count = 0;
        const countingCb = () => {
          if (++count == appUsage.length)
            done();
        };

        carryOver = require('..')(statistics, errorFn);
        map(appUsage,
          (usage) => carryOver.write(usage, usageResponse, countingCb));
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
        checkPutDocumentRef(putArgs[0], '35c4ff0f', 1438387200000);
        checkPutDocumentRef(putArgs[1], '35c4ff0f', 1438387200000);
        checkPutDocumentRef(putArgs[2], '35c4ff1f', 1438387200000);
        checkPutDocumentRef(putArgs[3], '35c4ff2f', 1438387200000);
      });

      it('removes stopped apps from the DB', () => {
        const removeArgs = removeMock.args;
        expect(removeArgs.length).to.equal(2);
        checkId(removeArgs[0], '35c4ff1f', 1438387200000);
        checkId(removeArgs[1], '35c4ff0f', 1438387200000);
      });

      it('populates statistics object', () => {
        expect(statistics.carryOver.getSuccess).to.equal(6);
        expect(statistics.carryOver.getFailure).to.equal(0);
        expect(statistics.carryOver.removeSuccess).to.equal(2);
        expect(statistics.carryOver.removeFailure).to.equal(0);
        expect(statistics.carryOver.upsertSuccess).to.equal(3);
        expect(statistics.carryOver.upsertFailure).to.equal(1);
      });

      it('calls error function', () => {
        expect(errorFn.callCount).to.equal(1);
        assert.alwaysCalledWith(errorFn,
          'Error upserting carry-over usage',
          testError, undefined, 'carryOver');
      });
    });

    context('when an app cannot be removed', () => {
      const testError = new Error('test error');

      beforeEach((done) => {
        removeMock = spy((doc, cb) => {
          cb(doc._id.indexOf('35c4ff1f') > 0 ? testError : undefined, {});
        });
        getMock = spy((doc, cb) => {
          cb(undefined, {});
        });
        putMock = spy((doc, cb) => {
          cb(undefined, {});
        });

        let count = 0;
        const countingCb = () => {
          if (++count == appUsage.length)
            done();
        };

        carryOver = require('..')(statistics, errorFn);
        map(appUsage,
          (usage) => carryOver.write(usage, usageResponse, countingCb));
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

      it('stores just part of the documents in the DB', () => {
        const putArgs = putMock.args;
        expect(putArgs.length).to.equal(4);
        checkPutDocumentRef(putArgs[0], '35c4ff0f', 1438387200000);
        checkPutDocumentRef(putArgs[1], '35c4ff0f', 1438387200000);
        checkPutDocumentRef(putArgs[2], '35c4ff1f', 1438387200000);
        checkPutDocumentRef(putArgs[3], '35c4ff2f', 1438387200000);
      });

      it('deletes just part of the stopped apps from the DB', () => {
        const removeArgs = removeMock.args;
        expect(removeArgs.length).to.equal(2);
        checkId(removeArgs[0], '35c4ff1f', 1438387200000);
        checkId(removeArgs[1], '35c4ff0f', 1438387200000);
      });

      it('populates statistics object', () => {
        expect(statistics.carryOver.getSuccess).to.equal(6);
        expect(statistics.carryOver.getFailure).to.equal(0);
        expect(statistics.carryOver.removeSuccess).to.equal(1);
        expect(statistics.carryOver.removeFailure).to.equal(1);
        expect(statistics.carryOver.upsertSuccess).to.equal(4);
        expect(statistics.carryOver.upsertFailure).to.equal(0);
      });

      it('calls error function', () => {
        expect(errorFn.callCount).to.equal(1);
        assert.alwaysCalledWith(errorFn,
          'Error removing carry-over usage',
          testError, undefined, 'carryOver');
      });
    });
  });

  context('when trying to delete non-existing document', () => {
    beforeEach((done) => {
      removeMock = spy((doc, cb) => {
        cb(undefined, {});
      });
      getMock = spy((key, cb) => {
        cb(undefined, {});
      });
      putMock = spy((doc, cb) => {
        cb(undefined, {});
      });

      // Write carry-over record and then delete it
      carryOver = require('..')(statistics, errorFn);
      carryOver.write(appUsage[2], usageResponse,
        () => carryOver.write(appUsage[3], usageResponse, done));
    });

    it('succeeds', (done) => {
      carryOver.write(appUsage[3], usageResponse, done);
    });
  });
});
