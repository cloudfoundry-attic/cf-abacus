'use strict';

const moment = require('abacus-moment');
const paging = require('abacus-paging');
const { yieldable, functioncb } = require('abacus-yieldable');

const createEventReader = require('../event-reader');


describe('event-reader', () => {
  context('when eventReader is created', () => {

    const sandbox = sinon.createSandbox();

    const url = 'https://cf-events-url';
    const token = 'fake-cf-admin-token';
    const minAge = 2000;

    const documentCreationTime = 100000;
    const document = {
      metadata: {
        created_at: documentCreationTime,
        guid: 'some-guid'
      }
    };

    let itemIteratorStub;
    let yEventReader;

    beforeEach(() => {
      itemIteratorStub = {
        next: sandbox.stub()
      };
      sandbox.stub(paging, 'itemIterator').returns(itemIteratorStub);
      sandbox.stub(paging, 'pageIterator');

      yEventReader = yieldable(createEventReader({
        url,
        token,
        minAge
      }));
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('propagates the correct arguments', () => {
      assert.calledWithExactly(paging.pageIterator, url, token);
    });

    context('when event is available', () => {
      beforeEach(() => {
        itemIteratorStub.next.onFirstCall().yields(undefined, document);
        itemIteratorStub.next.onSecondCall().yields(undefined, undefined);
      });

      it('the event gets returned', functioncb(function*() {
        const event = yield yEventReader.nextEvent();
        expect(event).to.deep.equal(document);

        const overflowEvent = yield yEventReader.nextEvent();
        expect(overflowEvent).to.deep.equal(undefined);
      }));
    });

    context('when too young event is reached', () => {
      beforeEach(() => {
        sandbox.stub(moment, 'now');
        moment.now.returns(documentCreationTime + minAge - 1);
        itemIteratorStub.next.onFirstCall().yields(undefined, document);
      });

      it('no more events are read', functioncb(function*() {
        const firstEvent = yield yEventReader.nextEvent();
        expect(firstEvent).to.deep.equal(undefined);

        const secondEvent = yield yEventReader.nextEvent();
        expect(secondEvent).to.deep.equal(undefined);

        assert.calledOnce(itemIteratorStub.next);
      }));
    });

    context('when "guid not found error" is returned by iterator', () => {
      beforeEach(() => {
        const guidNotFoundError = new Error();
        const response = {
          statusCode: 400,
          body: {
            code: 10005
          }
        };
        guidNotFoundError.response = response;
        itemIteratorStub.next.onFirstCall().yields(guidNotFoundError);
      });

      it('specific error is returned', (done) => {
        const nextEvent = functioncb(yEventReader.nextEvent);
        nextEvent((err, event) => {
          expect(err).to.not.equal(undefined);
          expect(err.guidNotFound).to.equal(true);
          done();
        });
      });
    });

    context('when unspecified error is returned by iterator', () => {
      const iterationError = new Error();

      beforeEach(() => {
        itemIteratorStub.next.onFirstCall().yields(iterationError);
      });

      it('the error gets returned', (done) => {
        const nextEvent = functioncb(yEventReader.nextEvent);
        nextEvent((actualErr, event) => {
          expect(actualErr).to.equal(iterationError);
          done();
        });
      });
    });

  });


});
