'use strict';

const _ = require('underscore');
const clone = _.clone;

const paging = require('abacus-paging');
const createServiceGuidClient = require('../service-guid-client');

const cfAdminToken = 'cfAdminToken';

describe('service-guid-client', () => {
  const sandbox = sinon.createSandbox();
  let nextItemStub;
  let client;

  beforeEach(() => {
    sandbox.stub(paging, 'pageIterator');

    nextItemStub = sandbox.stub();
    sandbox.stub(paging, 'itemIterator').returns({
      next: nextItemStub
    });
    client = createServiceGuidClient('http://some.url.com', cfAdminToken);
  });

  afterEach(() => {
    sandbox.restore();
  });

  context('when no services are provided', () => {
    const services = {};

    beforeEach((done) => {
      nextItemStub.yields(undefined, undefined);

      client.injectGuids(services, (err) => {
        done();
      });
    });

    it('expect services are unchanged', () => {
      expect(services).to.deep.equal({});
    });

    it('expect paging request is not executed', () => {
      assert.notCalled(nextItemStub);
    });
  });

  context('when service is provided', () => {
    context('with guid', () => {
      const services = {
        mongodb: {
          guid: 'some-guid'
        }
      };
      const expectedServices = clone(services);

      beforeEach((done) => {
        client.injectGuids(services, (err) => {
          done();
        });
      });

      it('expect service is unchanged', () => {
        expect(services).to.deep.equal(expectedServices);
      });

      it('expect paging request is not executed', () => {
        assert.notCalled(nextItemStub);
      });
    });

    context('without guid', () => {
      let services;

      beforeEach(() => {
        services = {
          mongodb: {
            plans: []
          }
        };
      });

      context('when call is successful', () => {
        const stubbedServiceGuid = 'some-guid';

        beforeEach(() => {
          nextItemStub.onFirstCall().yields(undefined, {
            entity: {
              label: 'mongodb'
            },
            metadata: {
              guid: stubbedServiceGuid
            }
          });
          nextItemStub.onSecondCall().yields(undefined, undefined);
        });

        it('expect service guid is injected', (done) => {
          client.injectGuids(services, (err) => {
            expect(services).to.deep.equal({
              mongodb: {
                plans: [],
                guid: stubbedServiceGuid
              }
            });
            done();
          });
        });
      });

      context('when error occurs', () => {
        let injectionError;
        let actualServices;
        let expectedServices;

        beforeEach(() => {
          expectedServices = clone(services);
        });

        context('with error', () => {
          const error = new Error('Read page fails');

          beforeEach((done) => {
            nextItemStub.yields(error);

            client.injectGuids(services, (err) => {
              actualServices = services;
              injectionError = err;
              done();
            });
          });

          it('expect error is propagated', () => {
            expect(injectionError).to.be.equal(error);
          });

          it('expect service is unchanged', () => {
            expect(actualServices).to.deep.equal(expectedServices);
          });
        });
      });
    });
  });
});
