'use strict';

const yieldable = require('abacus-yieldable');
const functioncb = yieldable.functioncb;

const eventProgress = require('../event-progress');

describe('event-progress', () => {
  const sandbox = sinon.sandbox.create();

  const startGuid = 'guid-start';
  const progressGuid = 'some-guid';
  const progressTimestamp = 'some-timestamp';

  let cacheWriteStub;
  let cacheReadStub;
  let progress;

  const createResult = (guid, timestamp) => {
    return {
      guid,
      timestamp
    };
  };

  beforeEach(() => {
    cacheWriteStub = sandbox.stub();
    cacheReadStub = sandbox.stub();
    const cache = {
      write: cacheWriteStub,
      read: cacheReadStub
    };

    progress = eventProgress(cache, startGuid);
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when neither loaded or saved', () => {
    it('get returns the specified initial progress', () => {
      const result = progress.get();
      expect(result).to.deep.equal(createResult(startGuid, undefined));
    });
  });

  context('when progress is cleared', () => {
    beforeEach(functioncb(function *() {
      cacheWriteStub.returns(function *() {});

      yield progress.clear();
    }));

    it('forwards operation to dbcache', () => {
      assert.calledOnce(cacheWriteStub);
      assert.calledWithExactly(cacheWriteStub, {
        lastRecordedGUID: undefined,
        lastRecordedTimestamp: undefined
      });
    });

    it('get returns an empty progress', () => {
      const result = progress.get();
      expect(result).to.deep.equal(createResult(undefined, undefined));
    });
  });

  context('when progress is saved', () => {
    beforeEach(functioncb(function *() {
      cacheWriteStub.returns(function *() {});

      yield progress.save({
        guid: progressGuid,
        timestamp: progressTimestamp
      });
    }));

    it('forwards operation to dbcache', () => {
      assert.calledOnce(cacheWriteStub);
      assert.calledWithExactly(cacheWriteStub, {
        lastRecordedGUID: progressGuid,
        lastRecordedTimestamp: progressTimestamp
      });
    });

    it('get returns the newly saved progress', () => {
      const result = progress.get();
      expect(result).to.deep.equal(
        createResult(progressGuid, progressTimestamp));
    });
  });

  context('when cached document is not available in dbcache', () => {
    beforeEach(() => {
      cacheReadStub.callsFake(function *() {
        return undefined;
      });
    });

    context('when progress is loaded', () => {
      let loadedProgress;

      beforeEach(functioncb(function *() {
        loadedProgress = yield progress.load();
      }));

      it('checked dbcache for available document', () => {
        assert.calledOnce(cacheReadStub);
      });

      it('returns the initial progess', () => {
        expect(loadedProgress).to.deep.equal(
          createResult(startGuid, undefined));
      });

      it('get returns the specified initial progress', () => {
        const result = progress.get();
        expect(result).to.deep.equal(createResult(startGuid, undefined));
      });
    });
  });

  context('when cached document is available in dbcache', () => {
    beforeEach(() => {
      cacheReadStub.callsFake(function *() {
        return {
          lastRecordedGUID: progressGuid,
          lastRecordedTimestamp: progressTimestamp
        };
      });
    });

    context('when progress is loaded', () => {
      let loadedProgress;

      beforeEach(functioncb(function *() {
        loadedProgress = yield progress.load();
      }));

      it('checked dbcache for available document', () => {
        assert.calledOnce(cacheReadStub);
      });

      it('returns the a progess based on the cached document', () => {
        expect(loadedProgress).to.deep.equal(
          createResult(progressGuid, progressTimestamp));
      });

      it('get returns the new progress', () => {
        const result = progress.get();
        expect(result).to.deep.equal(
          createResult(progressGuid, progressTimestamp));
      });
    });
  });
});
