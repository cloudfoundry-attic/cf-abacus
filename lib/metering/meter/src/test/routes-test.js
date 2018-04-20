'user strict';

describe('Test routes', () => {

  const req = {
    organization_id: 'test-org-id',
    space_id: 'test-space-id',
    resource_id: 'test-resource-id',
    plan_id: 'test-plan-id',
    resource_instance_id: 'test-resource-instance-id'
  };

  let sandbox;
  let retrieverStub;
  let sendStub;
  let res;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();

    retrieverStub = {
      retrieve: sandbox.stub()
    };

    sendStub = sandbox.stub();
    res = {
      status: sandbox.stub().callsFake(() => ({
        send: sendStub
      }))
    };
  });

  afterEach(() => {
    sandbox.reset();
  });

  context('when no document is found', () => {
    it('should respond with 404', async() => {
      retrieverStub.retrieve.resolves({});
      const route = require('./../lib/routes/routes')(retrieverStub);

      await route(req, res);

      assert.calledWith(res.status, 404);
      assert.called(retrieverStub.retrieve);
    });
  });

  context('when error reading document', () => {
    it('should respond with 500', async() => {
      retrieverStub.retrieve.rejects(new Error('failed to read'));
      const route = require('./../lib/routes/routes')(retrieverStub);

      await route(req, res);

      assert.calledWith(res.status, 500);
      assert.calledWith(sendStub, 'Unable to retrieve document');
      assert.called(retrieverStub.retrieve);
    });
  });

  context('when document is found', () => {
    it('hg', async() => {
      retrieverStub.retrieve.resolves(req);
      const route = require('./../lib/routes/routes')(retrieverStub);

      await route(req, res);

      assert.calledWith(res.status, 200);
      assert.called(retrieverStub.retrieve);
      assert.calledWith(sendStub, req);
    });
  });
});
