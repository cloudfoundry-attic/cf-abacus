'use strict';

const createServiceFilter = require('../service-filter');

describe('service-filter', () => {
  const allowedServices = {
    mongodb: {
      plans: ['small', 'medium']
    },
    postgres: {
      plans: ['medium', 'large']
    }
  };

  let filter;
  let event;

  beforeEach(() => {
    filter = createServiceFilter(allowedServices);
  });

  const createEvent = (serviceLabel, planName) => {
    return {
      entity: {
        service_label: serviceLabel,
        service_plan_name: planName
      }
    };
  };

  context('when space-plan is allowed', () => {
    beforeEach(() => {
      event = createEvent('mongodb', 'small');
    });

    it('does not mark event for filtering', () => {
      expect(filter(event)).to.equal(false);
    });
  });

  context('when service is not allowed', () => {
    beforeEach(() => {
      event = createEvent('redis', 'small');
    });

    it('marks event for filtering', () => {
      expect(filter(event)).to.equal(true);
    });
  });

  context('when service-plan is not allowed', () => {
    beforeEach(() => {
      event = createEvent('mongodb', 'large');
    });

    it('marks event for filtering', () => {
      expect(filter(event)).to.equal(true);
    });
  });
});
