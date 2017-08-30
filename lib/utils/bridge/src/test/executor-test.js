'use strict';

const execute = require('../executor');
const EventEmitter = require('events');

/*
Since the functionality that this test is covering contains a complex
asynchronous behavior, the tests themselves need to be asynchronous as well.

This is required in order to properly test the correct order of execution
of various aspects in the code (emit operations, callback involcatio, etc.)

As such, you will see throughout the tests the use of `process.nextTick`
and `setImmediate`. The choice whether to use the former or the latter
in the tests is very concious and important. If you are not familiar with
what the difference between them is, make sure to read up on them.

The most important thing, if you ever need to extend this test, is to
always implement stubs with `setImmediate` so that the async behavior
is performed as late as possible and to perform asynchronous validation
logic with `process.nextTick` so that validation happens as soon as possible.

The reason to perform validation asynchrinous is so that we give the
implementation a chance to complete operation. This way, we can handle
stray events or callback calls.

The reason to perform stub operations asynchronous is so that it mimics
actual async behavior and allow us to test out-of-order executions.
*/

describe('executor', () => {
  const sandbox = sinon.sandbox.create();

  let fakeProcess;
  let executableStartStub;
  let executableStopStub;
  let startSuccessListenerStub;
  let startFailureListenerStub;
  let stopSuccessListenerStub;
  let stopFailureListenerStub;

  beforeEach(() => {
    fakeProcess = new EventEmitter();
    sandbox.stub(process, 'on').callsFake((name, listener) => {
      fakeProcess.on(name, listener);
    });
    executableStartStub = sandbox.stub();
    executableStopStub = sandbox.stub();
    startSuccessListenerStub = sandbox.stub();
    startFailureListenerStub = sandbox.stub();
    stopSuccessListenerStub = sandbox.stub();
    stopFailureListenerStub = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const performExecute = () => {
    const executable = {
      start: executableStartStub,
      stop: executableStopStub
    };
    execute(executable)
      .on('start-success', startSuccessListenerStub)
      .on('start-failure', startFailureListenerStub)
      .on('stop-success', stopSuccessListenerStub)
      .on('stop-failure', stopFailureListenerStub);
  };

  context('when executable starts successfully', () => {
    let executableStartFinished;

    beforeEach(() => {
      executableStartFinished = false;
      executableStartStub.callsFake((cb) => {
        setImmediate(() => {
          executableStartFinished = true;
          cb();
        });
      });
    });

    it('should start and notify success', (done) => {
      startSuccessListenerStub.callsFake(() => {
        process.nextTick(() => {
          expect(executableStartFinished).to.equal(true);
          assert.calledOnce(executableStartStub);
          assert.notCalled(startFailureListenerStub);
          done();
        });
      });

      performExecute();
    });

    context('when executable stops successfully', () => {
      let executableStopFinished;

      beforeEach(() => {
        executableStopFinished = false;
        executableStopStub.callsFake((cb) => {
          setImmediate(() => {
            executableStopFinished = true;
            cb();
          });
        });
      });

      it('should stop and notify success on process exit', (done) => {
        startSuccessListenerStub.callsFake(() => {
          process.nextTick(() => {
            fakeProcess.emit('exit');
          });
        });

        stopSuccessListenerStub.callsFake(() => {
          process.nextTick(() => {
            expect(executableStopFinished).to.equal(true);
            assert.calledOnce(executableStopStub);
            assert.notCalled(stopFailureListenerStub);
            done();
          });
        });

        performExecute();
      });
    });

    context('when executable fails to stop', () => {
      const stopErr = new Error('failed to stop');
      let executableStopFinished;

      beforeEach(() => {
        executableStopFinished = false;
        executableStopStub.callsFake((cb) => {
          setImmediate(() => {
            executableStopFinished = true;
            cb(stopErr);
          });
        });
      });

      it('should notify failure on process exit', (done) => {
        startSuccessListenerStub.callsFake(() => {
          process.nextTick(() => {
            fakeProcess.emit('exit');
          });
        });

        stopFailureListenerStub.callsFake((err) => {
          process.nextTick(() => {
            expect(executableStopFinished).to.equal(true);
            assert.calledOnce(executableStopStub);
            assert.notCalled(stopSuccessListenerStub);
            expect(err).to.equal(stopErr);
            done();
          });
        });

        performExecute();
      });
    });

  });

  context('when executable fails to start', () => {
    const startErr = new Error('failed to start');
    let executableStartFinished;

    beforeEach(() => {
      executableStartFinished = false;
      executableStartStub.callsFake((cb) => {
        setImmediate(() => {
          executableStartFinished = true;
          cb(startErr);
        });
      });
    });

    it('should notify failure', (done) => {
      startFailureListenerStub.callsFake((err) => {
        process.nextTick(() => {
          expect(executableStartFinished).to.equal(true);
          assert.calledOnce(executableStartStub);
          assert.notCalled(startSuccessListenerStub);
          expect(err).to.equal(startErr);
          done();
        });
      });

      performExecute();
    });

    context('when executable stops successfully', () => {
      let executableStopFinished;

      beforeEach(() => {
        executableStopFinished = false;
        executableStopStub.callsFake((cb) => {
          setImmediate(() => {
            executableStopFinished = true;
            cb();
          });
        });
      });

      it('should stop and notify on process exit', (done) => {
        startFailureListenerStub.callsFake(() => {
          process.nextTick(() => {
            fakeProcess.emit('exit');
          });
        });

        stopSuccessListenerStub.callsFake(() => {
          process.nextTick(() => {
            expect(executableStopFinished).to.equal(true);
            assert.calledOnce(executableStopStub);
            assert.notCalled(stopFailureListenerStub);
            done();
          });
        });

        performExecute();
      });
    });

    context('when executable fails to stop', () => {
      const stopErr = new Error('failed to stop');
      let executableStopFinished;

      beforeEach(() => {
        executableStopFinished = false;
        executableStopStub.callsFake((cb) => {
          setImmediate(() => {
            executableStopFinished = true;
            cb(stopErr);
          });
        });
      });

      it('should notify failure on process exit', (done) => {
        startFailureListenerStub.callsFake(() => {
          process.nextTick(() => {
            fakeProcess.emit('exit');
          });
        });

        stopFailureListenerStub.callsFake((err) => {
          process.nextTick(() => {
            expect(executableStopFinished).to.equal(true);
            assert.calledOnce(executableStopStub);
            assert.notCalled(stopSuccessListenerStub);
            expect(err).to.equal(stopErr);
            done();
          });
        });

        performExecute();
      });
    });
  });

});
