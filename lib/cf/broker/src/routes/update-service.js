'use strict';

const httpStatus = require('http-status-codes');

const { BadRequestError } = require('abacus-api');

const debug = require('abacus-debug')('abacus-broker');
const edebug = require('abacus-debug')('e-abacus-broker');

/* eslint-disable complexity */
const updateServiceHandler = (clientsFactory, config, planBuilder) =>
  async (request, response) => {
    const instanceId = request.params.instance_id;
    const parameters = request.body.parameters;
    const organizationGuid = request.body.context.organization_guid;
    const spaceGuid = request.body.context.space_guid;

    debug('Updating service instance with parameters %o', { instanceId, parameters, organizationGuid, spaceGuid });

    if (!parameters) {
      response.status(httpStatus.OK).send();
      return;
    }

    let serviceConfig;
    try {
      serviceConfig = config.getServiceConfiguration(parameters);
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
            description: 'Invalid plan: resource provider mapping is not supported.'
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

        await serviceMappingClient.updateServiceMapping(
          instanceId,
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
      const provisioningClient = clientsFactory.createProvisioningClient(config.uris().provisioning);
      await Promise.all([
        provisioningClient.updateMeteringPlan(planBuilder.createMeteringPlan(planId, serviceConfig.userProvidedPlan)),
        provisioningClient.updatePricingPlan(planBuilder.createPricingPlan(planId, serviceConfig.userProvidedPlan)),
        provisioningClient.updateRatingPlan(planBuilder.createRatingPlan(planId, serviceConfig.userProvidedPlan))
      ]);

      debug('Service instance updated successfully. Plan id: %s, parameters: %s', planId,
        { instanceId, parameters, organizationGuid, spaceGuid });
      response.status(httpStatus.OK).send({});
    } catch (err) {
      edebug('Failed to update service instance %o: %o', { instanceId, parameters, organizationGuid, spaceGuid }, err);

      if (err instanceof BadRequestError) {
        response.status(httpStatus.BAD_REQUEST).send({
          description: `Invalid plan: "${err.message}"`
        });
        return;
      }

      response.status(httpStatus.INTERNAL_SERVER_ERROR).send();
    }
  };

module.exports = updateServiceHandler;
