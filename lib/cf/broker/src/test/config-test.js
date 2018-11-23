'use strict';

describe('Config', () => {
  let config;

  afterEach(() => {
    delete require.cache[require.resolve('../config.js')];
  });

  it('should generate correct plan_id', () => {
    const testInstanceId = 'instance_id';
    const testPlanId = 'plan_id';
    config = require('../config.js');
    expect(config.generatePlanId(testInstanceId, testPlanId)).to.be
      .equal(`${testInstanceId}-${testPlanId}`);
  });

  context('knows about dashboard uri', () => {
    beforeEach(() => {
      delete process.env.DASHBOARD_URI;
    });

    const requireConfig = (dashboardUri) => {
      process.env.DASHBOARD_URI = dashboardUri;
      config = require('../config.js');
    };

    it('should just read it form the environment', () => {
      const dashboardUrl = 'http://dashboard.com/some/';
      requireConfig(dashboardUrl);
      expect(config.dashboardUrl()).to.equal(dashboardUrl);
    });

    it('should read it form the environment and append trailing slash', () => {
      const dashboardUrl = 'http://dashboard.com/some';
      requireConfig(dashboardUrl);
      expect(config.dashboardUrl()).to.equal(dashboardUrl + '/');
    });

    it('should return just a slash when there is no variable exported',() => {
      config = require('../config.js');
      expect(config.dashboardUrl()).to.equal('/');
    });

    it('should append instanceId when passed',() => {
      const instanceId = 'a123e';
      const dashboardUrl = 'http://dashboard.com/some/';
      requireConfig(dashboardUrl);
      expect(config.dashboardUrl(instanceId))
        .to.equal(dashboardUrl + instanceId);
    });
  });

  context('validate mapping API', () => {

    context('when mapping API is provided', () => {
      const testMappingAPI = 'https://test.mapping.api';

      before(() => {
        process.env.MAPPING_API = testMappingAPI;
      });

      it('should return mapping url', () => {
        config = require('../config.js');
        expect(config.getMappingApi()).to.equal(testMappingAPI);
      });

      after(() => {
        delete process.env.MAPPING_API;
      });
    });

    context('when mapping api is not provided', () => {
      before(() => {
        config = require('../config.js');
      });

      it('should return "undefined"', () => {
        expect(config.getMappingApi()).to.equal(undefined);
      });
    });

  });

  context('get service configuration', () => {

    before(() => {
      config = require('../config.js');
    });

    it('should throw an error when "plans" is empty', () => {
      expect(() => config.getServiceConfiguration({ plans: [] })).to.throw(Error);
    });

    it('should throw an error when plan is not provided', () => {
      expect(() => config.getServiceConfiguration({ plans: [{}] })).to.throw(Error);
    });

    it('should throw an error when plans is not an array', () => {
      expect(() => config.getServiceConfiguration({
        plans: { '1': 1 }
      })).to.throw(Error);
    });

    it('should return service configuration when valid parameters are passed', () => {
      const plan = {
        plan_id: 1
      };
      const resourceProvider = {
        id: 1
      };

      expect(config.getServiceConfiguration({
        plans: [{
          plan: plan,
          resource_provider: resourceProvider
        }]
      })).to.deep.equal({
        userProvidedPlan: plan,
        resourceProvider: resourceProvider
      });
    });

  });

});
