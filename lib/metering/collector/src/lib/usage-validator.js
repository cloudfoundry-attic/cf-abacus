'use strict';

class InvalidSchemaError extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, InvalidSchemaError);
  }
};

class InvalidResourceInstance extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, InvalidResourceInstance);
  }
};

class InvalidAcountError extends Error {
  constructor(message) {
    super(message);
    Error.captureStackTrace(this, InvalidAcountError);
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
    this._validateSchema(usage);
    await this._validateResourceInstance(usage);
    await this._validateAccount(usage);
  }

  _validateSchema(usage) {
    try {
      this.schema.resourceUsage.validate(usage);
    } catch (e) {
      throw new InvalidSchemaError(e.message);
    }
  }

  async _validateResourceInstance(usage) {
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
      throw new InvalidResourceInstance();
  }

  async _validateAccount(usage) {
    try {
      await this.accountClient.validateAccount(usage);
    } catch (e) {
      if (e.unsupportedLicense)
        throw new UnsupportedLicenseTypeError(`Unsupported license type "${e.unsupportedLicense}"`);

      if (e.accountNotFound)
        throw new InvalidAcountError(e.message);

      throw e;
    }
  }


};

module.exports = {
  InvalidSchemaError,
  InvalidResourceInstance,
  InvalidAcountError,
  UnsupportedLicenseTypeError,
  UsageValidator
};


