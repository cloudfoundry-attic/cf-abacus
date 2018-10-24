'use strict';

const httpStatus = require('http-status-codes');

const fixture = require('./fixture');

describe('renewer stats auth tests', () => {
  context('when requesting statistics', () => {
    let externalSystemsMocks;

    before(async () => {
      externalSystemsMocks = fixture.externalSystemsMocks();
      externalSystemsMocks.startAll();

      fixture.renewer.start(externalSystemsMocks);
    });

    after((done) => {
      fixture.renewer.stop();
      externalSystemsMocks.stopAll(done);
    });

    context('With NO token', () => {
      it('UNAUTHORIZED is returned', async () => {
        const response = await eventually(fixture.renewer.readStats.withoutToken);
        expect(response.statusCode).to.equal(httpStatus.UNAUTHORIZED);
      });
    });

    context('With token without required scopes', () => {
      it('FORBIDDEN is returned', async () => {
        const response = await eventually(fixture.renewer.readStats.withMissingScope);
        expect(response.statusCode).to.equal(httpStatus.FORBIDDEN);
      });
    });
  });
});
