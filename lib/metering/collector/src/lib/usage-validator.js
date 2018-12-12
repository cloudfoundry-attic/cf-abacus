'use strict';

class InvalidSchemaError extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, InvalidSchemaError);
  }
};

class InvalidPlanError extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, InvalidPlanError);
  }
};

class UnsupportedLicenseTypeError extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, UnsupportedLicenseTypeError);
  }
};

class UsageValidator {
  constructor(schema, provisioningClient, accountClient) {
    this.schema = schema;
    this.provisioningClient = provisioningClient;
    this.accountClient = accountClient;
  }

  async validate(usage) {
    try {
      this.schema.resourceUsage.validate(usage);
    } catch (e) {
      throw new InvalidSchemaError(e.message);
    }

    const resourceInstance = {
      organizationId: usage.organization_id,
      spaceId: usage.space_id,
      consumerId: usage.consumer_id,
      resourceId: usage.resource_id,
      planId: usage.plan_id,
      resourceInstanceId: usage.resource_instance_id
    };

    const isValid = await this.provisioningClient.isResourceInstanceValid(resourceInstance, usage.end);
    if (!isValid)
      throw new InvalidPlanError();

    try {
      await this.accountClient.validateAccount(usage);
    } catch (e) {
      if (e.unsupportedLicense)
        throw new UnsupportedLicenseTypeError(e.message);

      throw e;
    }
  }
};

module.exports = {
  InvalidSchemaError,
  InvalidPlanError,
  UnsupportedLicenseTypeError,
  UsageValidator
};


