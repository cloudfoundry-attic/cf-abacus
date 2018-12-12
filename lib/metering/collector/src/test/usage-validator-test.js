'use strict';

const {
  UsageValidator,
  InvalidSchemaError,
  InvalidPlanError,
  UnsupportedLicenseTypeError
} = require('../lib/usage-validator');

describe('UsageValidator', () => {
  const usage = {
    end: 123,
    organization_id: 'organization-id',
    space_id: 'space-id',
    consumer_id: 'consumer-id',
    resource_id: 'resource-id',
    plan_id: 'plan-id',
    resource_instance_id: 'resource-instance-id'
  };

  let schemaStub;
  let provisioningClientStub;
  let accountClientStub;

  let usageValidator;

  beforeEach(() => {
    schemaStub = {
      resourceUsage: {
        validate: sinon.stub()
      }
    };
    provisioningClientStub = {
      isResourceInstanceValid: sinon.stub().callsFake(async () => true)
    };
    accountClientStub = {
      validateAccount: sinon.stub()
    };

    usageValidator = new UsageValidator(schemaStub, provisioningClientStub, accountClientStub);
  });

  context('when valid usage is passed', () => {

    it('should not throw Error', () => {
      usageValidator.validate(usage);
    });

  });

  context('when usage with invalid schema is passed', () => {

    beforeEach(() => {
      schemaStub.resourceUsage.validate.withArgs(usage).throws(new Error('some error'));
    });

    it('should throw InvalidSchemaError', async () => {
      await expect(usageValidator.validate(usage)).to.be.rejectedWith(InvalidSchemaError);
    });

  });

  context('when usage with invalid resource instance is passed', () => {

    beforeEach(() => {
      provisioningClientStub.isResourceInstanceValid.withArgs({
        organizationId: usage.organization_id,
        spaceId: usage.space_id,
        consumerId: usage.consumer_id,
        resourceId: usage.resource_id,
        planId: usage.plan_id,
        resourceInstanceId: usage.resource_instance_id
      }, usage.end).callsFake(async () => false);
    });

    it('should throw InvalidPlanError', async () => {
      await expect(usageValidator.validate(usage)).to.be.rejectedWith(InvalidPlanError);
    });

  });

  context('when usage with unsupported license type is passed', () => {

    beforeEach(() => {
      accountClientStub.validateAccount.withArgs(usage).callsFake(async () => {
        const error = new Error('some error');
        error.unsupportedLicense = true;
        throw error;
      });
    });

    it('should throw UnsupportedLicenseTypeError', async () => {
      await expect(usageValidator.validate(usage)).to.be.rejectedWith(UnsupportedLicenseTypeError);
    });

  });

  context('when request to account plugin fails', () => {
    const errorMessage = 'some error';

    beforeEach(() => {
      accountClientStub.validateAccount.withArgs(usage).callsFake(async () => {
        throw new Error(errorMessage);
      });
    });

    it('should rethrow the causing error', async () => {
      await expect(usageValidator.validate(usage)).to.be.rejectedWith(Error, errorMessage);
    });

  });

});
