'use strict';

const httpStatus = require('http-status-codes');
const { Presenter } = require('../lib/presenter');
const {
  ConflictingStartError,
  ConflictingEndError,
  ConflictingMappingError,
  MissingSpanError,
  OutOfOrderError
} = require('../lib/controller');

const { InvalidSchemaError } = require('../lib/schema-validator');
const { OutOfSlackError } = require('../lib/slack-validator');

describe('Presenter', () => {
  let schemaValidator;
  let slackValidator;

  let onStartSuccessful;
  let onStartInvalidEventError;
  let onStartOutOfSlackError;
  let onStartConflictError;
  let onStartFailure;

  let onStopSuccessful;
  let onStopInvalidEventError;
  let onStopConflictError;
  let onStopMissingSpanError;
  let onStopOutOfOrderError;
  let onStopFailure;

  let onMappingsSuccessful;
  let onMappingsInvalidError;
  let onMappingsConflictError;
  let onMappingsFailure;

  let controller;
  let presenter;
  let resp;

  beforeEach(() => {
    schemaValidator = {
      validateStartEvent: sinon.stub(),
      validateStopEvent: sinon.stub(),
      validateMappings: sinon.stub()
    };
    slackValidator = {
      validate: sinon.stub()
    };
    controller = {
      handleStart: sinon.stub(),
      handleStop: sinon.stub(),
      handleMappings: sinon.stub()
    };
    resp = {
      status: sinon.stub(),
      send: sinon.stub()
    };
    resp.status.returns(resp);
    presenter = new Presenter(controller, schemaValidator, slackValidator);

    onStartSuccessful = sinon.stub();
    presenter.on('start.successful', onStartSuccessful);
    onStartInvalidEventError = sinon.stub();
    presenter.on('start.error.invalid-event', onStartInvalidEventError);
    onStartOutOfSlackError = sinon.stub();
    presenter.on('start.error.out-of-slack', onStartOutOfSlackError);
    onStartConflictError = sinon.stub();
    presenter.on('start.error.conflict', onStartConflictError);
    onStartFailure = sinon.stub();
    presenter.on('start.failure', onStartFailure);

    onStopSuccessful = sinon.stub();
    presenter.on('stop.successful', onStopSuccessful);
    onStopInvalidEventError = sinon.stub();
    presenter.on('stop.error.invalid-event', onStopInvalidEventError);
    onStopConflictError = sinon.stub();
    presenter.on('stop.error.conflict', onStopConflictError);
    onStopMissingSpanError = sinon.stub();
    presenter.on('stop.error.missing-span', onStopMissingSpanError);
    onStopOutOfOrderError = sinon.stub();
    presenter.on('stop.error.out-of-order', onStopOutOfOrderError);
    onStopFailure = sinon.stub();
    presenter.on('stop.failure', onStopFailure);

    onMappingsSuccessful = sinon.stub();
    presenter.on('mappings.successful', onMappingsSuccessful);
    onMappingsInvalidError = sinon.stub();
    presenter.on('mappings.error.invalid-mappings', onMappingsInvalidError);
    onMappingsConflictError = sinon.stub();
    presenter.on('mappings.error.conflict', onMappingsConflictError);
    onMappingsFailure = sinon.stub();
    presenter.on('mappings.failure', onMappingsFailure);
  });

  const verifyResponse = (statusCode) => {
    assert.calledOnce(resp.status);
    assert.calledWithExactly(resp.status, statusCode);

    assert.calledOnce(resp.send);
  };

  describe('#handleStart', () => {
    const eventTimestamp = 123456;
    const req = {
      body: {
        timestamp: eventTimestamp,
        some: 'event'
      }
    };

    context('when no error occurs', () => {
      beforeEach(async () => {
        await presenter.handleStart(req, resp);
      });

      it('schema valdator is properly called', async () => {
        assert.calledOnce(schemaValidator.validateStartEvent);
        assert.calledWithExactly(schemaValidator.validateStartEvent, req.body);
      });

      it('slack validator is properly called', async () => {
        assert.calledOnce(slackValidator.validate);
        assert.calledWithExactly(slackValidator.validate, eventTimestamp);
      });

      it('controller is properly called', async () => {
        assert.calledOnce(controller.handleStart);
        assert.calledWithExactly(controller.handleStart, req.body);
      });

      it('"start.successful" event is emitted', async () => {
        assert.calledOnce(onStartSuccessful);
      });

      it('responds with "created" status code', async () => {
        verifyResponse(httpStatus.CREATED);
      });
    });

    context('when schema validator throws validation error', () => {
      beforeEach(async () => {
        schemaValidator.validateStartEvent.throws(new InvalidSchemaError());
        await presenter.handleStart(req, resp);
      });

      it('responds with "bad request" status code', () => {
        verifyResponse(httpStatus.BAD_REQUEST);
      });

      it('"start.error.invalid-event" event is emitted', () => {
        assert.notCalled(onStartSuccessful);
        assert.notCalled(onStartFailure);
        assert.calledOnce(onStartInvalidEventError);
      });
    });

    context('when slack validator throws validation error', () => {
      beforeEach(async () => {
        slackValidator.validate.throws(new OutOfSlackError());
        await presenter.handleStart(req, resp);
      });

      it('responds with "unprocessable entity" status code', () => {
        verifyResponse(httpStatus.UNPROCESSABLE_ENTITY);
      });

      it('"start.error.out-of-slack" event is emitted', () => {
        assert.notCalled(onStartSuccessful);
        assert.notCalled(onStartFailure);
        assert.calledOnce(onStartOutOfSlackError);
      });
    });

    context('when controller throws conflicting start error', () => {
      beforeEach(async() => {
        controller.handleStart.callsFake(async () => {
          throw new ConflictingStartError();
        });
        await presenter.handleStart(req, resp);
      });

      it('responds with "conflict" status code', () => {
        verifyResponse(httpStatus.CONFLICT);
      });
      
      it('"start.error.conflict" event is emitted', () => {
        assert.notCalled(onStartSuccessful);
        assert.notCalled(onStartFailure);
        assert.calledOnce(onStartConflictError);
      });
    });

    context('when controller throws an unknown error', () => {
      beforeEach(async () => {
        controller.handleStart.callsFake(async () => {
          throw new Error('stubbed to fail');
        });

        await presenter.handleStart(req, resp);
      });
      
      it('responds with "internal server error" status code', () => {
        verifyResponse(httpStatus.INTERNAL_SERVER_ERROR);
      });

      it('"start failure" event is emitted', () => {
        assert.notCalled(onStartSuccessful);
        assert.notCalled(onStartInvalidEventError);
        assert.notCalled(onStartOutOfSlackError);
        assert.notCalled(onStartConflictError);
        assert.calledOnce(onStartFailure);
      });
    });
  });

  describe('#handleStop', () => {
    const req = {
      body: {
        some: 'event'
      }
    };

    context('when no error occurs', () => {
      beforeEach(async () => {
        await presenter.handleStop(req, resp);
      });

      it('valdator is properly called', async () => {
        assert.calledOnce(schemaValidator.validateStopEvent);
        assert.calledWithExactly(schemaValidator.validateStopEvent, req.body);
      });

      it('controller is properly called', async () => {
        assert.calledOnce(controller.handleStop);
        assert.calledWithExactly(controller.handleStop, req.body);
      });

      it('"stop.successful" event is emitted', async () => {
        assert.calledOnce(onStopSuccessful);
      });

      it('responds with "created" status code', async () => {
        verifyResponse(httpStatus.CREATED);
      });
    });

    context('when schema validator throws validation error', () => {
      beforeEach(async () => {
        schemaValidator.validateStopEvent.throws(new InvalidSchemaError());
        await presenter.handleStop(req, resp);
      });

      it('responds with "bad request" status code', () => {
        verifyResponse(httpStatus.BAD_REQUEST);
      });

      it('"stop.error.invalid-event" event is emitted', () => {
        assert.notCalled(onStopSuccessful);
        assert.notCalled(onStopFailure);
        assert.notCalled(onStopConflictError);
        assert.calledOnce(onStopInvalidEventError);
      });
    });

    context('when controller throws conflicting end error', () => {
      beforeEach(async () => {
        controller.handleStop.callsFake(async () => {
          throw new ConflictingEndError();
        });
        await presenter.handleStop(req, resp);
      });

      it('responds with "conflict" status code', () => {
        verifyResponse(httpStatus.CONFLICT);
      });

      it('"stop.error.conflict" event is emitted', () => {
        assert.notCalled(onStopSuccessful);
        assert.notCalled(onStopFailure);
        assert.calledOnce(onStopConflictError);
      });
    });

    context('when controller throws missing span error', () => {
      beforeEach(async () => {
        controller.handleStop.callsFake(async () => {
          throw new MissingSpanError();
        });
        await presenter.handleStop(req, resp);
      });

      it('responds with "unprocessable entity" status code', () => {
        verifyResponse(httpStatus.UNPROCESSABLE_ENTITY);
      });

      it('"stop.error.missing-span" event is emitted', () => {
        assert.notCalled(onStopSuccessful);
        assert.notCalled(onStopFailure);
        assert.calledOnce(onStopMissingSpanError);
      });
    });

    context('when controller throws out of order error', () => {
      beforeEach(async () => {
        controller.handleStop.callsFake(async () => {
          throw new OutOfOrderError();
        });
        await presenter.handleStop(req, resp);
      });

      it('responds with "unprocessable entity" status code', () => {
        verifyResponse(httpStatus.UNPROCESSABLE_ENTITY);
      });

      it('"stop.error.out-of-order" event is emitted', () => {
        assert.notCalled(onStopSuccessful);
        assert.notCalled(onStopFailure);
        assert.calledOnce(onStopOutOfOrderError);
      });
    });

    context('when controller throws an unknown error', () => {
      beforeEach(async () => {
        controller.handleStop.callsFake(async () => {
          throw new Error('stubbed to fail');
        });
        await presenter.handleStop(req, resp);
      });

      it('responds with "internal server error" status code', () => {
        verifyResponse(httpStatus.INTERNAL_SERVER_ERROR);
      });

      it('"stop failure" event is emitted', () => {
        assert.notCalled(onStopSuccessful);
        assert.notCalled(onStopInvalidEventError);
        assert.notCalled(onStopConflictError);
        assert.notCalled(onStopMissingSpanError);
        assert.notCalled(onStopOutOfOrderError);
        assert.calledOnce(onStopFailure);
      });
    });
  });

  describe('#handleMappings', () => {
    const req = {
      body: {
        resource_id: 'test-resource-id',
        plan_id: 'test-plan-id',
        metering_plan: 'test-metering-plan',
        rating_plan: 'test-rating-plan',
        pricing_plan: 'test-pricing-plan'
      }
    };

    context('when mappings creation is successful', () => {
      beforeEach(async () => {
        await presenter.handleMappings(req, resp);
      });

      it('delegates call to controller', () => {
        assert.calledOnce(controller.handleMappings);
        assert.calledWithExactly(controller.handleMappings,
          req.body.resource_id,
          req.body.plan_id,
          req.body.metering_plan,
          req.body.rating_plan,
          req.body.pricing_plan
        );
  
      });

      it('response with "created" status code', () => {
        verifyResponse(httpStatus.CREATED);
      });
      
      it('"mappings.successful" event is emitted', async () => {
        assert.calledOnce(onMappingsSuccessful);
      });
    });

    context('when schema validator throws validation error', () => {
      beforeEach(async () => {
        schemaValidator.validateMappings.throws(new InvalidSchemaError());
        await presenter.handleMappings(req, resp);
      });

      it('responds with "bad request" status code', () => {
        verifyResponse(httpStatus.BAD_REQUEST);
      });

      it('"start.error.invalid-mappings" event is emitted', () => {
        assert.notCalled(onMappingsSuccessful);
        assert.notCalled(onMappingsFailure);
        assert.calledOnce(onMappingsInvalidError);
      });
    });

    context('when controller throws conflict mapping error', () => {
      beforeEach(async () => {
        controller.handleMappings.callsFake(async () => {
          throw new ConflictingMappingError();
        });

        await presenter.handleMappings(req, resp);
      });

      it('responds with "conflict" status code', async () => {
        verifyResponse(httpStatus.CONFLICT);
      });
      
      it('"mappings.error.conflict" event is emitted', () => {
        assert.notCalled(onMappingsSuccessful);
        assert.notCalled(onMappingsFailure);
        assert.calledOnce(onMappingsConflictError);
      });
    });

    context('when controller throws an unknown error', () => {
      beforeEach(async () => {
        controller.handleMappings.callsFake(async () => {
          throw new Error('stubbed to fail');
        });
        await presenter.handleMappings(req, resp);
      });

      it('responds with "internal server error" status code', async () => {
        verifyResponse(httpStatus.INTERNAL_SERVER_ERROR);
      });

      it('"mappings failure" event is emitted', () => {
        assert.notCalled(onMappingsSuccessful);
        assert.notCalled(onMappingsConflictError);
        assert.calledOnce(onMappingsFailure);
      });
    });
  });
});
