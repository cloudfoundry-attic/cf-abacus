'use strict';

const buildStatistics = require('../statistics');

describe('statistics', () => {
  const defaultStatistics = {
    usage: {
      missingToken: 0,
      reportFailures: 0,
      reportSuccess: 0,
      reportConflict: 0,
      reportBusinessError: 0,
      loopFailures: 0,
      loopSuccess: 0,
      loopConflict: 0,
      loopSkip: 0
    },
    carryOver: {
      getSuccess: 0,
      getNotFound: 0,
      getFailure: 0,
      removeSuccess: 0,
      removeFailure: 0,
      upsertSuccess: 0,
      upsertFailure: 0,
      readSuccess: 0,
      readFailure: 0,
      docsRead: 0
    },
    paging: {
      missingToken: 0,
      pageReadSuccess: 0,
      pageReadFailures: 0,
      pageProcessSuccess: 0,
      pageProcessFailures: 0,
      pageProcessEnd: 0
    }
  };

  context('when predefined statistics are not passed', () => {
    it('should return default statistics', () => {
      const statistics = buildStatistics();
      expect(statistics).to.deep.equal(defaultStatistics);
    });
  });

  context('when predefined statistics are passed', () => {
    context('when they don\'t override default ones', () => {
      const predefinedStatistics = {
        some: 'property'
      };

      it('should return passed statistics and default statistics', () => {
        const statistics = buildStatistics(predefinedStatistics);

        expect(statistics.some).to.be.equal(predefinedStatistics.some);
        expect(statistics.usage).to.deep.equal(defaultStatistics.usage);
        expect(statistics.carryOver).to.deep.equal(defaultStatistics.carryOver);
        expect(statistics.paging).to.deep.equal(defaultStatistics.paging);
      });
    });

    context('when they override default ones', () => {
      const predefinedStatistics = {
        paging: {
          missingToken: 1
        }
      };

      it('should return passed statistics and default statistics', () => {
        const statistics = buildStatistics(predefinedStatistics);

        expect(statistics.usage).to.deep.equal(defaultStatistics.usage);
        expect(statistics.carryOver).to.deep.equal(defaultStatistics.carryOver);
        expect(statistics.paging.missingToken).to.equal(1);
      });
    });
  });
});
