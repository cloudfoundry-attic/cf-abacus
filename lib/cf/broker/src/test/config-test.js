'use strict';

describe('Config', () => {
  let config;

  afterEach(() => {
    delete require.cache[require.resolve('../config.js')];
  });

  context('validate prefix', () => {
    before(() => {
      config = require('../config.js');
    });

    it('should set a prefix to a parameter specified', () => {
      const id = '123';
      expect(config.prefixWithResourceProvider(id))
        .to.equal(`${config.defaultResourceProviderPrefix}${id}`);
    });

    it('should return the prefix when there is no parameter specified', () => {
      expect(config.prefixWithResourceProvider())
        .to.equal(config.defaultResourceProviderPrefix);
    });
  });

  it('should generate correct plan_id', () => {
    const testInstanceId = 'instance_id';
    const testPlanId = 'plan_id';
    config = require('../config.js');
    expect(config.generatePlanId(testInstanceId, testPlanId)).to.be
      .equal(`${testInstanceId}-${testPlanId}`);
  });

  context('knows about usage collector path', () => {
    beforeEach(() => {
      delete process.env.USAGE_COLLECTOR_PATH;
    });

    it('should read it form the environment', () => {
      const path = '/some/path';
      process.env.USAGE_COLLECTOR_PATH = path;
      config = require('../config.js');
      expect(config.usageCollectorPath).to.equal(path);
    });

    it('should return default when no varaible is exported',() => {
      config = require('../config.js');
      expect(config.usageCollectorPath)
        .to.equal(config.defaultUsageCollectorPath);
    });
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

      it('should return provisioning url', () => {
        expect(config.getMappingApi()).to.equal(config.uris().provisioning);
      });
    });

  });

  context('validate service configuration', () => {
    it('should fail when service configuration is empty', () => {
      expect(config.isServiceConfigValid({})).to.equal(false);
    });

    it('should fail when plans is empty', () => {
      expect(config.isServiceConfigValid({ plans: [] })).to.equal(false);
    });

    it('should fail when plan is not provided', () => {
      expect(config.isServiceConfigValid({ plans: [{}] })).to.equal(false);
    });

    it('should fail when plans is not an array', () => {
      expect(config.isServiceConfigValid({
        plans: { '1': 1 }
      })).to.equal(false);
    });

  });
});
