'use strict';

const httpStatus = require('http-status-codes');

const createHealthchecker = require('../lib/healthchecker');

describe('healthchecker', () => {
  const refreshIntervalMs = 1;
  let sandbox;
  let healthchecker;
  let healthStatus;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  const waitAndFetchHealthStatus = (done) => {
    setTimeout(() => {
      healthStatus = healthchecker.getSystemHealth();
      done();
    }, 100 * refreshIntervalMs);
  };

  context('when no application groups are provided', () => {

    beforeEach((done) => {
      const applicationGroups = {};
      healthchecker = createHealthchecker({
        applicationGroups,
        refreshIntervalMs
      });

      waitAndFetchHealthStatus(done);
    });

    it('should return empty result',() => {
      expect(healthStatus).to.deep.equal({});
    });
  });

  context('when application groups are provided', () => {
   
    let applicationHealthClientStub;

    beforeEach(() => {
      applicationHealthClientStub = {
        getApplicationHealth: sandbox.stub().returns(Promise.resolve(httpStatus.OK))
      };
    });

    context('when internal cache is still not initialized', () => {
      const tooLongRefreshInterval = 100000;
  
      beforeEach((done) => {
        const applicationGroups = {
          aggregator: 1
        };
        healthchecker = createHealthchecker({
          applicationGroups,
          refreshIntervalMs: tooLongRefreshInterval
        });
  
        waitAndFetchHealthStatus(done);
      });
  
      it('should return empty result',() => {
        expect(healthStatus).to.deep.equal({});
      });
    });

    context('when single application group is provided', () => {
      const groupName = 'aggregator';

      context('when single app per group', () => {
        const appUri = `http://${groupName}.localhost`;

        beforeEach((done) => {
          const applicationGroups = {
            [groupName]: 1
          };

          const applicationsUrisBuilderStub = {
            buildUris: sandbox.stub().returns(Promise.resolve([appUri]))
          };

          healthchecker = createHealthchecker({
            applicationGroups,
            refreshIntervalMs
          }, applicationHealthClientStub, applicationsUrisBuilderStub);

          waitAndFetchHealthStatus(done);
        });

        it('should return application status', () => {
          expect(healthStatus).to.deep.equal({
            aggregator: {
              [appUri]: httpStatus.OK
            }
          });
        });

        it('should call the application uri', () => {
          assert.called(applicationHealthClientStub.getApplicationHealth);
          assert.calledWith(applicationHealthClientStub.getApplicationHealth, appUri);
        });
      });

      context('when multiple apps per group', () => {
        const appCount = 2;
        const app0Uri = `http://${groupName}-0.localhost`;
        const app1Uri = `http://${groupName}-1.localhost`;

        let applicationsUrisBuilderStub;

        beforeEach((done) => {
          const applicationGroups = {
            [groupName]: appCount
          };

          applicationsUrisBuilderStub = {
            buildUris: sandbox.stub().returns(Promise.resolve([app0Uri, app1Uri]))
          };

          healthchecker = createHealthchecker({
            applicationGroups,
            refreshIntervalMs
          }, applicationHealthClientStub, applicationsUrisBuilderStub);
          
          waitAndFetchHealthStatus(done);
        });

        it('should return all apps statuses', () => {
          expect(healthStatus).to.deep.equal({
            [groupName]: {
              [app0Uri]: httpStatus.OK,
              [app1Uri]: httpStatus.OK
            }
          });
        });

        it('should call the applications uris', () => {
          assert.called(applicationHealthClientStub.getApplicationHealth);
          assert.calledWith(applicationHealthClientStub.getApplicationHealth, app0Uri);
          assert.calledWith(applicationHealthClientStub.getApplicationHealth, app1Uri);
        });

        it('should build proper application uris', () => {
          assert.called(applicationsUrisBuilderStub.buildUris);
          assert.calledWith(applicationsUrisBuilderStub.buildUris, groupName, appCount);
        });
      });

    });

    context('when multiple groups are provided', () => {
      const aggregatorGroup = 'aggregator';
      const aggregatorAppsCount = 1;
      const accumulatorGroup = 'accumulator';
      const accumulatorAppsCount = 2;

      const aggregatorUri = `http://${aggregatorGroup}.localhost`;
      const accumulator0Uri = `http://${accumulatorGroup}-0.localhost`;
      const accumulator1Uri = `http://${accumulatorGroup}-1.localhost`;

      let applicationsUrisBuilderStub;

      beforeEach((done) => {
        const applicationGroups = {
          [aggregatorGroup]: aggregatorAppsCount,
          [accumulatorGroup]: accumulatorAppsCount
        };

        const buildUrisStub = sandbox.stub();
        buildUrisStub.withArgs(aggregatorGroup, 1).returns(Promise.resolve([aggregatorUri]));
        buildUrisStub.withArgs(accumulatorGroup, 2).returns(Promise.resolve([accumulator0Uri, accumulator1Uri]));

        applicationsUrisBuilderStub = {
          buildUris: buildUrisStub
        };

        healthchecker = createHealthchecker({
          applicationGroups,
          refreshIntervalMs
        }, applicationHealthClientStub, applicationsUrisBuilderStub);
        
        waitAndFetchHealthStatus(done);
      });

      it('should return applications statuses', () => {
        expect(healthStatus).to.deep.equal({
          aggregator: {
            [aggregatorUri]: httpStatus.OK
          },
          accumulator: {
            [accumulator0Uri]: httpStatus.OK,
            [accumulator1Uri]: httpStatus.OK
          }
        });
      });

      it('should call the application uri', () => {
        assert.called(applicationHealthClientStub.getApplicationHealth);
        assert.calledWith(applicationHealthClientStub.getApplicationHealth, aggregatorUri);
        assert.calledWith(applicationHealthClientStub.getApplicationHealth, accumulator0Uri);
        assert.calledWith(applicationHealthClientStub.getApplicationHealth, accumulator1Uri);
      });

      it('should build proper application uris', () => {
        assert.called(applicationsUrisBuilderStub.buildUris);
        assert.calledWith(applicationsUrisBuilderStub.buildUris, aggregatorGroup, aggregatorAppsCount);
        assert.calledWith(applicationsUrisBuilderStub.buildUris, accumulatorGroup, accumulatorAppsCount);
      });
    });

  });

});
