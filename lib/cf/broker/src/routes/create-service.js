'use strict';

const httpStatus = require('http-status-codes');

const { BadRequestError } = require('abacus-api');

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');

const getServiceConfiguration = (config, parameters) => {
  if(!parameters)
    return {
      userProvidedPlan: undefined,
      resourceProvider: undefined
    };

  return config.getServiceConfiguration(parameters);
};

/* eslint-disable complexity */
const createServiceHandler = (clientsFactory, config, planBuilder) =>
  async (request, response) => {
    const instanceId = request.params.instance_id;
    const parameters = request.body.parameters;
    const organizationGuid = request.body.context.organization_guid;
    const spaceGuid = request.body.context.space_guid;

    debug('Creating service instance with parameters %o', { instanceId, parameters, organizationGuid, spaceGuid });

    let serviceConfig;
    try {
      serviceConfig = getServiceConfiguration(config, parameters);
    } catch (e) {
      edebug('Service configuration is not valid, %o', parameters);
      response.status(httpStatus.BAD_REQUEST).send({ description: 'Invalid service configuration.' });
      return;
    };

    const planId = config.generatePlanId(instanceId, instanceId);

    try {
      if (serviceConfig.resourceProvider) {
        if (!config.getMappingApi()) {
          edebug('Cannot create service mapping. No url defined.');
          response.status(httpStatus.BAD_REQUEST).send({
            description: 'Provided plan is not valid. Resource provider mapping is not supported.'
            + 'Please remove "resourceProvider" field'
          });
          return;
        }
        const serviceMappingClient = clientsFactory.createServiceMappingClient(config.getMappingApi());
        const plan = `${config.defaultPlanName}/${planId}/${planId}/${planId}`;

        const serviceMapping = {
          organization_guid: organizationGuid,
          space_guid: spaceGuid,
          service_name: serviceConfig.resourceProvider.service_name,
          service_plan_name: serviceConfig.resourceProvider.service_plan_name
        };

        await serviceMappingClient.createServiceMapping(
          instanceId,
          plan,
          serviceMapping
        );
      }
    } catch (error) {
      edebug('Failed to create service mapping: %o', error);
      response.status(httpStatus.INTERNAL_SERVER_ERROR).send();
      return;
    }

    try {
      const provisioningClient = clientsFactory.createProvisioningClient(config.uris().provisioning);

      await Promise.all([
        provisioningClient.createMeteringPlan(planBuilder.createMeteringPlan(planId, serviceConfig.userProvidedPlan)),
        provisioningClient.createPricingPlan(planBuilder.createPricingPlan(planId, serviceConfig.userProvidedPlan)),
        provisioningClient.createRatingPlan(planBuilder.createRatingPlan(planId, serviceConfig.userProvidedPlan)),
        provisioningClient.mapMeteringPlan(instanceId, config.defaultPlanName, planId),
        provisioningClient.mapPricingPlan(instanceId, config.defaultPlanName, planId),
        provisioningClient.mapRatingPlan(instanceId, config.defaultPlanName, planId)
      ]);

      debug('Service instance created successfully. Plan id: %s, parameters: %o',
        planId, { instanceId, parameters, organizationGuid, spaceGuid });
      response.status(httpStatus.CREATED).send({
        dashboard_url: config.dashboardUrl(request.params.instance_id)
      });
    } catch (err) {
      edebug('Failed to create service instance %o: %o',
        { instanceId, parameters, organizationGuid, spaceGuid }, err);

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

module.exports = createServiceHandler;
