'use strict';

const createFilter = require('../lib/healthcheck-filter');

describe('healthcheck filter test', () => {

  context('when internal applications list is not provided', () => {
    let filteredInternalHealth;
    let filteredExternalHealth;

    beforeEach(() => {
      const filter = createFilter(undefined);
      filteredInternalHealth = filter.internalComponents('internal components');
      filteredExternalHealth = filter.internalComponents('external components');
    });

    it('should not filter healthcheck status', () => {
      expect(filteredInternalHealth).to.be.equal('internal components');
      expect(filteredExternalHealth).to.be.equal('external components');
    });
  });

  context('when internal applications list is provided', () => {
    const internalComponents = ['meter', 'accumulator', 'aggregator'];
    const applicationsHealth = {
      meter: {
        meter1: 200,
        meter2: 200
      },
      collector: {
        collector1: 200,
        collector2: 200
      },
      accumulator: {
        accumulator1: 200,
        accumulator2: 200
      },
      aggregator: {
        aggregator1: 200,
        aggregator2: 200
      }
    };

    context('should filter healthcheck status', () => {
      let filter;
      let filtered;

      beforeEach(() => {
        filter = createFilter(internalComponents);
      });

      it('of internal components', () => {
        filtered = filter.internalComponents(applicationsHealth);
        expect(filtered).to.deep.equal({
          meter: {
            meter1: 200,
            meter2: 200
          },
          accumulator: {
            accumulator1: 200,
            accumulator2: 200
          },
          aggregator: {
            aggregator1: 200,
            aggregator2: 200
          }
        });
      });

      it('of external components', () => {
        filtered = filter.externalComponents(applicationsHealth);
        expect(filtered).to.deep.equal({
          collector: {
            collector1: 200,
            collector2: 200
          }
        });
      });
    });
  });
});
