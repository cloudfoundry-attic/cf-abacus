'use strict';

const cmdline = require('abacus-cmdline');
const moment = require('abacus-moment');
const oauth = require('abacus-oauth');
const { extend } = require('underscore');

const debug = require('abacus-debug')('abacus-resource-provder-scenario-test');

const createUaaUtils = require('./utils/uaa-utils.js');
const abacusUtil = require('abacus-test-abacus-util');
const { checkCorrectSetup } = require('abacus-test-helper');

const testEnv = {
  api: process.env.CF_API_URI,
  authServer: process.env.AUTH_SERVER_URL,
  origin: process.env.CF_AUTH_ORIGIN,
  adminUser: process.env.CF_ADMIN_USER,
  adminUserPassword: process.env.CF_ADMIN_PASSWORD,
  uaaAdminSecret: process.env.UAA_SECRET,
  abacusSysUser: process.env.SYSTEM_CLIENT_ID,
  abacusSysPassword: process.env.SYSTEM_CLIENT_SECRET,
  orgName: process.env.CF_ORG,
  spaceName: process.env.CF_SPACE,
  provisioningUrl: process.env.PROVISIONING_URL,
  collectorUrl: process.env.COLLECTOR_URL,
  reportingUrl: process.env.REPORTING_URL,
  clientSecret: process.env.CLIENT_SECRET || 'test-secret',
  waitTimeout: process.env.WAIT_TIMEOUT || 300000
};

describe('Create and update plans acceptance test @cfonly', () => {

  const prefix = moment.utc().valueOf();
  const resourceId = `${prefix}-test-resource-id`;
  const meteringPlanId = `${prefix}-metering-plan-id-${resourceId}`;
  const pricingPlanId = `${prefix}-pricing-plan-id-${resourceId}`;
  const ratingPlanId = `${prefix}-rating-plan-id-${resourceId}`;

  const planId = 'basic';
  const resourceInstanceId = `${prefix}-123-456-789-101112131415d`;
  const consumerId = `app:${resourceInstanceId}`;

  let cfUtils;
  let uaaUtils;
  let abacusClient;

  let usageToken;
  let systemToken;

  before((done) => {
    checkCorrectSetup(testEnv);

    cfUtils = cmdline.cfutils(
      testEnv.api,
      testEnv.adminUser,
      testEnv.adminUserPassword,
      testEnv.origin
    );

    uaaUtils = createUaaUtils(testEnv.authServer, testEnv.uaaAdminSecret);
    abacusClient = abacusUtil(testEnv.provisioningUrl, testEnv.collectorUrl, testEnv.reportingUrl);

    usageToken = oauth.cache(testEnv.api, resourceId, testEnv.clientSecret,
      `abacus.usage.${resourceId}.write,abacus.usage.${resourceId}.read`);
    systemToken = oauth.cache(testEnv.api, testEnv.abacusSysUser, testEnv.abacusSysPassword,
      'abacus.usage.write,abacus.usage.read');

    uaaUtils.createUaaClient(resourceId, testEnv.clientSecret);
    systemToken.start(() => {
      usageToken.start(done);
    });
  });

  after(() => {
    uaaUtils.removeUaaClient(resourceId);
  });

  const getPlan = (resourceType, planBody, planId, done) => {
    abacusClient.getPlan(systemToken, resourceType, planId, (err, val) => {
      expect(err).to.equal(undefined);
      debug('\n       GET  %s', val.request.uri.href);
      expect(val.statusCode).to.equal(200);
      expect(val.body).to.deep.equal(planBody);
      done();
    });
  };

  const createPlan = (resourceType, planBody, done) => {
    abacusClient.createPlan(systemToken, resourceType, planBody, (err, val) => {
      expect(err).to.equal(undefined);
      debug('\n       POST %s', val.request.uri.href);
      expect(val.statusCode).to.equal(201);
      done();
    });
  };

  const updatePlan = (resourceType, planBody, planId, done) => {
    abacusClient.updatePlan(systemToken, resourceType,
      planId, planBody, (err, val) => {
        expect(err).to.equal(undefined);
        debug('\n       PUT  %s', val.request.uri.href);
        expect(val.statusCode).to.equal(200);
        done();
      });
  };

  const getMapping = (resourceType, planId, done) => {
    abacusClient.getMapping(systemToken, resourceType, resourceId,
      (err, val) => {
        expect(err).to.equal(undefined);
        debug('\n       GET  %s', val.request.uri.href);
        expect(val.statusCode).to.equal(200);
        expect(val.body.plan_id).to.equal(planId);
        done();
      });
  };

  const createMapping = (resourceType, planId, done) => {
    abacusClient.createMapping(systemToken, resourceType, resourceId, planId,
      (err, val) => {
        expect(err).to.equal(undefined);
        debug('\n       POST %s', val.request.uri.href);
        expect(val.statusCode).to.equal(200);
        done();
      });
  };

  context('Metering plan', () => {
    const generatePlanBody = (meter) => {
      return {
        plan_id: meteringPlanId,
        measures: [
          {
            name: 'classifiers',
            unit: 'INSTANCE'
          }
        ],
        metrics: [
          {
            name: 'classifier_instances',
            unit: 'INSTANCE',
            type: 'discrete',
            meter: meter
          }
        ]
      };
    };

    const meteringPlanBody = generatePlanBody('(m)=>m.classifiers');
    const updatedMeteringPlanBody = generatePlanBody('(m)=>m.classifiers * 2');

    it('should create plan', (done) => {
      createPlan('metering', meteringPlanBody, done);
    });

    it('should update plan', (done) => {
      updatePlan('metering', updatedMeteringPlanBody, meteringPlanId, done);
    });

    it('should be updated', (done) => {
      getPlan('metering', updatedMeteringPlanBody, meteringPlanId, done);
    });

    it('should create metering mapping', (done) => {
      createMapping('metering', meteringPlanId, done);
    });

    it('should get metering mapping', (done) => {
      getMapping('metering', meteringPlanId, done);
    });
  });

  context('Pricing plan', () => {
    const generatePricingPlanBody = (price) => {
      return {
        plan_id: pricingPlanId,
        metrics: [
          {
            name: 'classifier_instances',
            prices: [
              {
                country: 'USA',
                price: price
              },
              {
                country: 'EUR',
                price: 0.00011
              },
              {
                country: 'CAN',
                price: 0.00016
              }
            ]
          }
        ]
      };
    };

    const pricingPlanBody = generatePricingPlanBody(0.00010);
    const updatedPricingPlanBody = generatePricingPlanBody(0.00015);

    it('should create plan', (done) => {
      createPlan('pricing', pricingPlanBody, done);
    });

    it('should update plan', (done) => {
      updatePlan('pricing', updatedPricingPlanBody, pricingPlanId, done);
    });

    it('should be updated', (done) => {
      getPlan('pricing', updatedPricingPlanBody, pricingPlanId, done);
    });

    it('should create pricing mapping', (done) => {
      createMapping('pricing', pricingPlanId, done);
    });

    it('should get pricing mapping', (done) => {
      getMapping('pricing', pricingPlanId, done);
    });
  });

  context('Rating plan', () => {
    const generateRatingPlanBody = (rate) => {
      return {
        plan_id: ratingPlanId,
        metrics: [
          {
            name: 'classifier_instances',
            rate: rate,
            charge: '(t,cost)=>cost'
          }
        ]
      };
    };

    const ratingPlanBody = generateRatingPlanBody('(p,qt)=>p?p*qt:0');
    const updatedRatingPlanBody = generateRatingPlanBody('(p,qt)=>p?p*qt*2:0');

    it('should create plan', (done) => {
      createPlan('rating', ratingPlanBody, done);
    });

    it('should update plan', (done) => {
      updatePlan('rating', updatedRatingPlanBody, ratingPlanId, done);
    });

    it('should be updated', (done) => {
      getPlan('rating', updatedRatingPlanBody, ratingPlanId, done);
    });

    it('should create rating mapping', (done) => {
      createMapping('rating', ratingPlanId, done);
    });

    it('should get rating mapping', (done) => {
      getMapping('rating', ratingPlanId, done);
    });
  });

  context('Usage', () => {
    let orgId;
    let spaceId;
    let usageBody;

    before(() => {
      const org = cfUtils.org.get(testEnv.orgName);
      orgId = org.metadata.guid;
      const space = cfUtils.space.get(orgId, testEnv.spaceName);
      spaceId = space.metadata.guid;

      const now = moment.utc().valueOf();
      usageBody = {
        start: now,
        end: now,
        organization_id: orgId,
        space_id: spaceId,
        resource_id: resourceId,
        plan_id: planId,
        consumer_id: consumerId,
        resource_instance_id: resourceInstanceId,
        measured_usage: [
          {
            measure: 'classifiers',
            quantity: 512
          }
        ]
      };
    });

    it('should be accepted and processed', (done) => {
      abacusClient.postUsage(usageToken, usageBody, (err, val) => {
        expect(err).to.equal(undefined);
        debug('\n       POST %s', val.request.uri.href);
        expect(val.statusCode).to.equal(202);
        const locationHeader = val.headers.location;
        expect(locationHeader).to.not.equal(undefined);
        abacusClient.waitUntilUsageIsProcessed(usageToken, locationHeader, testEnv.waitTimeout, done);
      });
    });

    const validateMetric = (body) => {
      const metric = body.accumulated_usage[0].metric;
      expect(metric).to.equal('classifier_instances');
    };

    const validateQuantity = (body) => {
      const windows = body.accumulated_usage[0].windows;
      const lastMonthQuantity = windows[windows.length - 1][0].quantity;
      expect(lastMonthQuantity).to.equal(1024);
    };

    it('should exist', (done) => {
      abacusClient.getOrganizationUsage(systemToken, orgId, (err, response) => {
        const filter = {
          space_id: spaceId,
          consumer_id: consumerId,
          resource_id: resourceId,
          plan_id: planId,
          metering_plan_id: meteringPlanId,
          rating_plan_id: ratingPlanId,
          pricing_plan_id: pricingPlanId
        };
        const timeBasedKey =
          abacusClient.getTimeBasedKeyProperty(response.body, filter);

        extend(filter, {
          org_id: orgId,
          resource_instance_id: resourceInstanceId,
          time_based_key: timeBasedKey });

        abacusClient.getUsage(usageToken, filter, (err, response) => {
          expect(err).to.equal(undefined);
          debug('\n       GET  %s', response.request.uri.href);
          expect(response.statusCode).to.equal(200);

          validateMetric(response.body);
          validateQuantity(response.body);

          done();
        });
      });
    });
  });
});
