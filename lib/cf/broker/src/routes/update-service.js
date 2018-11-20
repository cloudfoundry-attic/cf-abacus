'use strict';

const httpStatus = require('http-status-codes');

const { BadRequestError } = require('abacus-api');

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');

module.exports = (createServiceMappingClient, provisioningClient, config, planBuilder) => {

  const getSinglePlan = (serviceConfig) => {
    const plans = serviceConfig ? serviceConfig.plans : undefined;
    return plans ? plans[0] : undefined;
  };

  const getRequestParameters = (request) => ({
    instance_id: request.params.instance_id,
    service_id: request.body.service_id,
    serviceConfig: request.body.parameters,
    organization_guid: request.body.context && request.body.context.organization_guid,
    space_guid: request.body.context && request.body.context.space_guid
  });

  /* eslint-disable complexity */
  const updateService = async (request, response) => {
    const requestParameters = getRequestParameters(request);

    debug('Updating service instance with parameters %o', requestParameters);

    if (!requestParameters.serviceConfig) {
      response.status(httpStatus.OK).send();
      return;
    }

    if(!config.isServiceConfigValid(requestParameters.serviceConfig)) {
      edebug('Service configuration is not valid, %o', requestParameters.serviceConfig);
      response.status(httpStatus.BAD_REQUEST).send({ description: 'Invalid service configuration.' });
      return;
    }

    const planId = config.generatePlanId(requestParameters.instance_id, requestParameters.instance_id);
    const userProvidedPlan = getSinglePlan(requestParameters.serviceConfig);

    try {
      if (userProvidedPlan && userProvidedPlan.resource_provider) {
        if (!config.getMappingApi()) {
          edebug('Cannot create service mapping. No url defined.');
          response.status(httpStatus.BAD_REQUEST).send({
            description: 'Provided plan is not valid. Resource provider mapping is not supported.'
            + 'Please remove "resourceProvider" field'
          });
          return;
        }

        const serviceMappingClient = createServiceMappingClient(config.getMappingApi());
        const plan = `${config.defaultPlanName}/${planId}/${planId}/${planId}`;

        const serviceMapping = {
          organization_guid: requestParameters.organization_guid,
          space_guid: requestParameters.space_guid,
          service_name: userProvidedPlan.resource_provider.service_name,
          service_plan_name: userProvidedPlan.resource_provider.service_plan_name
        };

        await serviceMappingClient.updateServiceMapping(
          requestParameters.instance_id,
          plan,
          serviceMapping
        );
      }
    } catch (error) {
      edebug('Failed to update service mapping: %o', error);
      response.status(httpStatus.INTERNAL_SERVER_ERROR).send();
      return;
    }

    try {
      await Promise.all([
        provisioningClient.updateMeteringPlan(planBuilder.createMeteringPlan(planId, userProvidedPlan)),
        provisioningClient.updatePricingPlan(planBuilder.createPricingPlan(planId, userProvidedPlan)),
        provisioningClient.updateRatingPlan(planBuilder.createRatingPlan(planId, userProvidedPlan))
      ]);

      debug('Service instance updated successfully. Plan id: %s, parameters: %s', planId, requestParameters);
      response.status(httpStatus.OK).send();
    } catch (err) {
      edebug('Failed to update service instance %o: %o', requestParameters, err);

      if (err instanceof BadRequestError) {
        response.status(httpStatus.BAD_REQUEST).send({
          description: `Provided plan is not valid. Error: "${err.message}"`
        });
        return;
      }

      response.status(httpStatus.INTERNAL_SERVER_ERROR).send();
    }
  };

  return {
    updateService
  };
};
