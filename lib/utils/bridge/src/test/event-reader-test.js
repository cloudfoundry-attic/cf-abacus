'use strict';

const moment = require('abacus-moment');
const paging = require('abacus-paging');
const createEventReader = require('../event-reader');

describe('event-reader', () => {
  const sandbox = sinon.sandbox.create();

  const url = 'https://cf-events-url';
  const token = 'fake-cf-admin-token';
  const minAge = 2000;
  const statistics = 'fake-statistics-object';

  const documentCreationTime = 100000;
  const document = {
    metadata: {
      created_at: documentCreationTime,
      guid: 'some-guid'
    }
  };

  let readPageStub;
  let pollCallbackStub;
  let finishedListenerStub;

  beforeEach(() => {
    readPageStub = sandbox.stub(paging, 'readPage');
    pollCallbackStub = sandbox.stub();
    finishedListenerStub = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const startPolling = () => {
    const reader = createEventReader({
      url,
      token,
      minAge,
      statistics
    });
    reader.poll(pollCallbackStub).on('finished', finishedListenerStub);
  };

  describe('finished event', () => {
    const readPageError = new Error('failed!');

    context('when readPage reports failure', () => {
      beforeEach(() => {
        readPageStub.callsFake((uri, cfToken, perf, statistics,
          { processResourceFn, success, failure }) => {

          failure(readPageError);
        });
      });

      it('calls the finished listener with an error', (done) => {
        finishedListenerStub.callsFake((err) => {
          expect(err).to.be.an.instanceOf(Error);
          done();
        });
        startPolling();
      });
    });

    context('when readPage reports failure without error object', () => {
      beforeEach(() => {
        readPageStub.callsFake((uri, cfToken, perf, statistics,
          { processResourceFn, success, failure }) => {

          failure();
        });
      });

      it('calls the finished listener with an error', (done) => {
        finishedListenerStub.callsFake((err) => {
          expect(err).to.be.an.instanceOf(Error);
          done();
        });
        startPolling();
      });
    });

    context('when readPage reports a "guid not found" error', () => {
      const response = {
        statusCode: 400,
        body: {
          code: 10005
        }
      };

      beforeEach(() => {
        readPageStub.callsFake((uri, cfToken, perf, statistics,
          { processResourceFn, success, failure }) => {

          failure(readPageError, response);
        });
      });

      it('calls the finished listener with a special error', (done) => {
        finishedListenerStub.callsFake((err) => {
          expect(err).to.be.an.instanceOf(Error);
          expect(err.guidNotFound).to.equal(true);
          done();
        });
        startPolling();
      });
    });

    context('when readPage reports success', () => {
      beforeEach(() => {
        readPageStub.callsFake((uri, cfToken, perf, statistics,
          { processResourceFn, success, failure }) => {

          success();
        });
      });

      it('calls the finished listener without an error', (done) => {
        finishedListenerStub.callsFake(done);
        startPolling();
      });
    });
  });

  describe('polling', () => {
    let readPageResourceCallback;

    beforeEach(() => {
      readPageResourceCallback = sandbox.stub();
      readPageStub.callsFake((uri, cfToken, perf, statistics, {
        processResourceFn, success, failure
      }) => {
        processResourceFn(document, readPageResourceCallback);
      });
      sandbox.stub(moment, 'now');
    });

    context('when event is old enough', () => {
      beforeEach(() => {
        moment.now.returns(documentCreationTime + minAge + 1);
      });

      it('propagates arguments to process callback', (done) => {
        pollCallbackStub.callsFake((event, cb) => {
          expect(event).to.deep.equal(document);
          expect(cb).to.equal(readPageResourceCallback);
          assert.notCalled(readPageResourceCallback);
          done();
        });
        startPolling();
      });
    });

    context('when event is not old enough', () => {
      beforeEach(() => {
        moment.now.returns(documentCreationTime + minAge - 1);
      });

      it('callback is called', (done) => {
        readPageResourceCallback.callsFake(() => {
          assert.notCalled(pollCallbackStub);
          done();
        });
        startPolling();
      });
    });
  });
});
