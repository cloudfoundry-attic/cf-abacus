'use strict';

const { clone } = require('underscore');

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
    context('with guids', () => {
      const services = {
        mongodb: {
          guids: ['some-guid']
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

    context('without guids', () => {
      let services;
      const stubbedServiceGuid = 'some-guid';
      const createServiceObject = (guid) => ({
        entity: {
          label: 'mongodb'
        },
        metadata: {
          guid: guid
        }
      });

      beforeEach(() => {
        services = {
          mongodb: {
            plans: []
          }
        };
      });

      context('when the service is with a single broker', () => {

        beforeEach(() => {
          nextItemStub.onFirstCall().yields(undefined, createServiceObject(stubbedServiceGuid));
          nextItemStub.onSecondCall().yields(undefined, undefined);
        });

        it('expect a single service guid is injected', (done) => {
          client.injectGuids(services, (err) => {
            expect(services).to.deep.equal({
              mongodb: {
                plans: [],
                guids: [stubbedServiceGuid]
              }
            });
            done();
          });
        });
      });

      context('when the service is with a multiple brokers', () => {
        const anotherStubbedServiceGuid = 'another-guid';
        beforeEach(() => {
          nextItemStub.onFirstCall().yields(undefined, createServiceObject(stubbedServiceGuid));
          nextItemStub.onSecondCall().yields(undefined, createServiceObject(anotherStubbedServiceGuid));
          nextItemStub.onThirdCall().yields(undefined, undefined);
        });

        it('expect two service guids are injected', (done) => {
          client.injectGuids(services, (err) => {
            expect(services).to.deep.equal({
              mongodb: {
                plans: [],
                guids: [stubbedServiceGuid, anotherStubbedServiceGuid]
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
