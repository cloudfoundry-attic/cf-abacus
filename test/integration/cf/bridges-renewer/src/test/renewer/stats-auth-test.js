'use strict';

const httpStatus = require('http-status-codes');

const yieldable = require('abacus-yieldable');

const fixture = require('./fixture');
const createWait = require('abacus-wait');

const waitUntil = yieldable(createWait().until);
const statsEndpointIsAvailable = fixture.renewer.readStats.isEndpointAvailable;

describe('renewer stats auth tests', () => {
  context('when requesting statistics', () => {
    let externalSystemsMocks;

    before(
      yieldable.functioncb(function*() {
        externalSystemsMocks = fixture.externalSystemsMocks();
        externalSystemsMocks.startAll();

        fixture.renewer.start(externalSystemsMocks);

        yield waitUntil(statsEndpointIsAvailable);
      })
    );

    after((done) => {
      fixture.renewer.stop();
      externalSystemsMocks.stopAll(done);
    });

    context('With NO token', () => {
      it(
        'UNAUTHORIZED is returned',
        yieldable.functioncb(function*() {
          const response = yield fixture.renewer.readStats.withoutToken();
          expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
        })
      );
    });

    context('With token without required scopes', () => {
      it(
        'FORBIDDEN is returned',
        yieldable.functioncb(function*() {
          const response = yield fixture.renewer.readStats.withMissingScope();
          expect(response.statusCode).to.equal(httpStatus.FORBIDDEN);
        })
      );
    });
  });
});
