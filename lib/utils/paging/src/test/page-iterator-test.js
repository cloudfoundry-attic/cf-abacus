'use strict';

/* eslint-disable max-len */

const request = require('abacus-request');
const { functioncb, yieldable } = require('abacus-yieldable');
const httpStatus = require('http-status-codes');
const { each } = require('underscore');
const pageIterator = require('../page-iterator');

describe('pageIterator', () => {
  const sandbox = sinon.createSandbox();
  const firstPage = ['firstResource','secondResource'];
  const secondPage = ['thirdResource'];
  const rootURL = 'https://api.example.org';
  const page2URL = '/page2';
  const tokenString = 'Bearer SomeTokenHashHere';
  const token = () => tokenString;

  let iterator;

  beforeEach(() => {
    sandbox.stub(request, 'get');
  });

  afterEach(() => {
    sandbox.restore();
  });

  const createOKResponse = (page, nextURL = undefined) => ({
    statusCode: httpStatus.OK,
    body: {
      next_url: nextURL,
      resources: page
    }
  });

  const createFailureResponse = () => ({
    statusCode: httpStatus.INTERNAL_SERVER_ERROR
  });

  const assertGetCalled = (...urls) => {
    assert.callCount(request.get, urls.length);
    each(urls, (url) => {
      assert.calledWithExactly(request.get, url, {
        headers: {
          Authorization: tokenString
        },
        json: true
      }, sinon.match.any);
    });
  };

  context('when token is valid', () => {
    beforeEach(() => {
      iterator = pageIterator(rootURL, token);
    });

    context('when multiple pages are available', () => {
      beforeEach(() => {
        request.get.onFirstCall().yields(undefined, createOKResponse(firstPage, page2URL));
        request.get.onSecondCall().yields(undefined, createOKResponse(secondPage));
      });

      it('iterates all pages via requests', functioncb(function*() {
        const yNext = yieldable(iterator.next);

        const firstPageRead = yield yNext();
        expect(firstPageRead).to.deep.equal(firstPage);

        const secondPageRead = yield yNext();
        expect(secondPageRead).to.deep.equal(secondPage);

        const thirdPageRead = yield yNext();
        expect(thirdPageRead).to.equal(undefined);

        const overflowPageRead = yield yNext();
        expect(overflowPageRead).to.equal(undefined);

        assertGetCalled(rootURL, rootURL + page2URL);
      }));
    });

    context('when get request fails', () => {
      beforeEach(() => {
        request.get.onFirstCall().yields(new Error('cannot contact server'), createFailureResponse());
      });

      it('should return error on next', (done) => {
        iterator.next((err) => {
          expect(err).to.not.equal(undefined);
          done();
        });
      });

      context('when subsequent request succeeds', () => {
        beforeEach(() => {
          request.get.onSecondCall().yields(undefined, createOKResponse(firstPage));
        });

        it('should succeed on second call of next', (done) => {
          iterator.next(() => {
            iterator.next((err, page) => {
              expect(err).to.equal(undefined);
              expect(page).to.equal(firstPage);
              assertGetCalled(rootURL, rootURL);
              done();
            });
          });
        });
      });
    });

    context('when get request returns error status', () => {
      beforeEach(() => {
        request.get.yields(undefined, createFailureResponse());
      });

      it('should return error on next', (done) => {
        iterator.next((err) => {
          expect(err).to.not.equal(undefined);
          done();
        });
      });
    });

  });

  context('when token is invalid', () => {
    const brokenToken = () => undefined;

    beforeEach(() => {
      iterator = pageIterator(rootURL, brokenToken);
    });

    it('errors on iteration', (done) => {
      iterator.next((err) => {
        expect(err).to.not.equal(undefined);
        done();
      });
    });
  });
});
