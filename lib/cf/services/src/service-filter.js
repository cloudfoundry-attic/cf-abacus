'use strict';

const create = (allowedServices) =>
  (event) => {
    const serviceLabel = event.entity.service_label;
    const planName = event.entity.service_plan_name;

    const service = allowedServices[serviceLabel];
    return !service || !service.plans.includes(planName);
  };

module.exports = create;
