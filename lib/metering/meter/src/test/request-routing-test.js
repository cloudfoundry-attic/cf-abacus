'use strict';

const createRequestRouting = require('../lib/request-routing');

describe('Request Routing tests', () => {
  const url = 'https://test-app.com';
  const doc = {
    organization_id: 'org-id',
    resource_instance_id: 'resource-instance-id',
    consumer_id: 'consumer-id',
    plan_id: 'plan-id'
  };

  let sandbox;
  let partitionFake;
  let requestRouting;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.reset();
  });

  context('when using multiple apps', () => {
    let routeUri;
    let partitionerFn;

    context('when app url contains port', () => {
      const appUrl = 'https://test-app.com:1000';

      beforeEach(async() => {
        partitionerFn = sandbox.stub().yields(undefined, [5]);
        partitionFake = {
          partitioner: sandbox.stub().returns(partitionerFn),
          createForwardFn: sandbox.stub()
        };
        requestRouting = createRequestRouting(partitionFake, 10);
        routeUri = await requestRouting.getUri(appUrl, doc);
      });

      it('returned app port contains partition number ', () => {
        expect(routeUri).to.equal('https://test-app.com:1005');
      });
    });

    context('when app url does not contain port', () => {

      beforeEach(async() => {
        partitionerFn = sandbox.stub().yields(undefined, [5]);
        partitionFake = {
          partitioner: sandbox.stub().returns(partitionerFn),
          createForwardFn: sandbox.stub()
        };
        requestRouting = createRequestRouting(partitionFake, 10);
        routeUri = await requestRouting.getUri(url, doc);
      });


      it('partitioner called with proper args', () => {
        assert.calledWith(partitionerFn,
          `${doc.organization_id}/${doc.resource_instance_id}/${doc.consumer_id}/${doc.plan_id}`);
      });

      it('returned app host name contains partition number ', () => {
        expect(routeUri).to.equal('https://test-app-5.com');
      });

    });
  });

  context('when using single app', () => {
    let routeUri;

    beforeEach(async() => {
      partitionFake = {
        nopartition: sandbox.stub().yields(undefined, undefined),
        createForwardFn: sandbox.stub()
      };
      requestRouting = createRequestRouting(partitionFake, 1);
      routeUri = await requestRouting.getUri(url, doc);
    });

    it('partitioner called with proper args', () => {
      assert.calledWith(partitionFake.nopartition,
        `${doc.organization_id}/${doc.resource_instance_id}/${doc.consumer_id}/${doc.plan_id}`);
    });

    it('returns correct app uri ', () => {
      expect(routeUri).to.equal('https://test-app.com');
    });
  });

});
