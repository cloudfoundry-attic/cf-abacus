'use strict';

const { Scheduler } = require('../lib/scheduler');

describe('Scheduler', () => {

  const oneSecInMillis = 1 * 1000;
  let scheduler;

  context('#schedule', () => {
    let executionFnStub;

    beforeEach(() => {
      executionFnStub = sinon.stub();
      scheduler = new Scheduler();
    });

    context('when successful execution is scheduled', () => {
      let successfulListenerStub;

      beforeEach(() => {
        successfulListenerStub = sinon.stub();
        scheduler.on('successful', successfulListenerStub);
        executionFnStub.callsFake(async () => {});
      });

      it('it get executed on scheduled interval and "succesful" events are fired', async () => {
        scheduler.schedule(executionFnStub, oneSecInMillis);

        await eventually(async () => assert.calledThrice(executionFnStub), 4 * oneSecInMillis);
        expect(successfulListenerStub.callCount).to.be.least(3);
      });

    });

    context('when failing execution is scheduled', () => {
      const error = new Error('error');
      let failureListenerStub;

      beforeEach(() => {
        failureListenerStub = sinon.stub();
        scheduler.on('failure', failureListenerStub);
        executionFnStub.callsFake(async () => {
          throw error;
        });
      });

      it('it get executed on scheduled interval and "failure" events are fired', async () => {
        scheduler.schedule(executionFnStub, oneSecInMillis);

        await eventually(async () => assert.calledTwice(executionFnStub), 3 * oneSecInMillis);
        expect(failureListenerStub.callCount).to.be.least(2);
        assert.calledWithExactly(failureListenerStub, error);
      });

    });

  });

});
