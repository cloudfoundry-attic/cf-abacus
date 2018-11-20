'use strict';

const httpStatus = require('http-status-codes');

const { BadRequestError } = require('abacus-api');

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');

module.exports = (serviceMappingClient, provisioningClient, config, planBuilder) => {

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

  const createServiceMapping = async (requestParameters, resourceProvider, planId) => {
    const plan = `${config.defaultPlanName}/${planId}/${planId}/${planId}`;

    const serviceMapping = {
      organization_guid: requestParameters.organization_guid,
      space_guid: requestParameters.space_guid,
      service_name: resourceProvider.service_name,
      service_plan_name: resourceProvider.service_plan_name
    };

    await serviceMappingClient.createServiceMapping(
      requestParameters.instance_id,
      plan,
      serviceMapping
    );
  };

  /* eslint-disable complexity */
  const createService = async (request, response) => {
    const requestParameters = getRequestParameters(request);

    debug('Creating service instance with parameters %o', requestParameters);

    if(requestParameters.serviceConfig && !config.isServiceConfigValid(requestParameters.serviceConfig)) {
      edebug('Service configuration is not valid, %o', requestParameters.serviceConfig);
      response.status(httpStatus.BAD_REQUEST).send({ description: 'Invalid service configuration.' });
      return;
    }

    const planId = config.generatePlanId(requestParameters.instance_id, requestParameters.instance_id);
    const userProvidedPlan = getSinglePlan(requestParameters.serviceConfig);

    try {
      if (userProvidedPlan && userProvidedPlan.resource_provider)
        await createServiceMapping(requestParameters, userProvidedPlan.resource_provider, planId);
    } catch (error) {
      edebug('Failed to create service mapping: %o', error);
      response.status(httpStatus.INTERNAL_SERVER_ERROR).send();
      return;
    }

    try {
      await Promise.all([
        provisioningClient.createMeteringPlan(planBuilder.createMeteringPlan(planId, userProvidedPlan)),
        provisioningClient.createPricingPlan(planBuilder.createPricingPlan(planId, userProvidedPlan)),
        provisioningClient.createRatingPlan(planBuilder.createRatingPlan(planId, userProvidedPlan)),
        provisioningClient.mapMeteringPlan(requestParameters.instance_id, config.defaultPlanName, planId),
        provisioningClient.mapPricingPlan(requestParameters.instance_id, config.defaultPlanName, planId),
        provisioningClient.mapRatingPlan(requestParameters.instance_id, config.defaultPlanName, planId)
      ]);

      debug('Service instance created successfully. Plan id: %s, parameters: %s', planId, requestParameters);
      response.status(httpStatus.CREATED).send({
        dashboard_url: config.dashboardUrl(request.params.instance_id)
      });
    } catch (err) {
      edebug('Failed to create service instance %o: %o', requestParameters, err);

      if (err instanceof BadRequestError) {
        // Only create plan requests could return "bad request" error
        response.status(httpStatus.BAD_REQUEST).send({
          description: `Provided plan is not valid. Error: "${err.message}"`
        });
        return;
      }

      response.status(httpStatus.INTERNAL_SERVER_ERROR).send();
    }

  };

  return {
    createService
  };
};
