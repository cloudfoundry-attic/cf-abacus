'use strict';

const httpStatus = require('http-status-codes');

const createHealthchecker = require('../lib/healthchecker');

describe('healthchecker', () => {
  let sandbox;
  let healthchecker;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  context('when no application groups are provided', () => {

    beforeEach(async() => {
      const applicationGroups = {};
      healthchecker = await createHealthchecker(applicationGroups);
    });

    it('should return empty result',() => {
      const healthStatus = healthchecker.getSystemHealth();
      expect(healthStatus).to.deep.equal({});
    });
  });

  context('when application groups are provided', () => {
    let healthStatus;
    let applicationHealthClientStub;

    beforeEach(async() => {
      applicationHealthClientStub = {
        getApplicationHealth: sandbox.stub().returns(Promise.resolve(httpStatus.OK))
      };
    });

    context('when single application group is provided', () => {
      const groupName = 'aggregator';

      context('when single app per group', () => {
        const appUri = `http://${groupName}.localhost`;

        beforeEach(async() => {
          const applicationGroups = {
            [groupName]: 1
          };

          const applicationsUrisBuilderStub = {
            buildUris: sandbox.stub().returns(Promise.resolve([appUri]))
          };

          healthchecker = await createHealthchecker(applicationGroups,
            applicationHealthClientStub, applicationsUrisBuilderStub);
          healthStatus = healthchecker.getSystemHealth();
        });

        it('should return application status', () => {
          expect(healthStatus).to.deep.equal({
            aggregator: {
              [appUri]: httpStatus.OK
            }
          });
        });

        it('should call the application uri', () => {
          assert.calledOnce(applicationHealthClientStub.getApplicationHealth);
          assert.calledWith(applicationHealthClientStub.getApplicationHealth, appUri);
        });
      });

      context('when multiple apps per group', () => {
        const appCount = 2;
        const app0Uri = `http://${groupName}-0.localhost`;
        const app1Uri = `http://${groupName}-1.localhost`;

        let applicationsUrisBuilderStub;

        beforeEach(async() => {
          const applicationGroups = {
            [groupName]: appCount
          };

          applicationsUrisBuilderStub = {
            buildUris: sandbox.stub().returns(Promise.resolve([app0Uri, app1Uri]))
          };

          healthchecker = await createHealthchecker(applicationGroups,
            applicationHealthClientStub, applicationsUrisBuilderStub);
          healthStatus = healthchecker.getSystemHealth();
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
          assert.calledTwice(applicationHealthClientStub.getApplicationHealth);
          assert.calledWith(applicationHealthClientStub.getApplicationHealth, app0Uri);
          assert.calledWith(applicationHealthClientStub.getApplicationHealth, app1Uri);
        });

        it('should build proper application uris', () => {
          assert.calledOnce(applicationsUrisBuilderStub.buildUris);
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

      beforeEach(async() => {
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

        healthchecker = await createHealthchecker(applicationGroups,
          applicationHealthClientStub, applicationsUrisBuilderStub);
        healthStatus = healthchecker.getSystemHealth();
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
        assert.calledThrice(applicationHealthClientStub.getApplicationHealth);
        assert.calledWith(applicationHealthClientStub.getApplicationHealth, aggregatorUri);
        assert.calledWith(applicationHealthClientStub.getApplicationHealth, accumulator0Uri);
        assert.calledWith(applicationHealthClientStub.getApplicationHealth, accumulator1Uri);
      });

      it('should build proper application uris', () => {
        assert.calledTwice(applicationsUrisBuilderStub.buildUris);
        assert.calledWith(applicationsUrisBuilderStub.buildUris, aggregatorGroup, aggregatorAppsCount);
        assert.calledWith(applicationsUrisBuilderStub.buildUris, accumulatorGroup, accumulatorAppsCount);
      });
    });

    context('with multiple healthchecker app instances', () => {
      const groupName = 'aggregator';
      const appUri = `http://${groupName}.localhost`;

      let applicationHealthClientStub;
      let clock;

      beforeEach(async() => {
        clock = sinon.useFakeTimers();

        process.env.INSTANCE_INDEX = 2;

        applicationHealthClientStub = {
          getApplicationHealth: sandbox.stub().returns(Promise.resolve(httpStatus.OK))
        };
        const applicationGroups = {
          [groupName]: 1
        };
        const applicationsUrisBuilderStub = {
          buildUris: sandbox.stub().returns(Promise.resolve([appUri]))
        };

        healthchecker = await createHealthchecker(applicationGroups,
          applicationHealthClientStub, applicationsUrisBuilderStub);
        healthchecker.getSystemHealth();

        clock.tick(5000 + 2 * 3501);
      });

      afterEach(() => {
        delete process.env.INSTANCE_INDEX;
        clock.restore();
      });

      it('shifts in time the call to the application uri', () => {
        assert.calledTwice(applicationHealthClientStub.getApplicationHealth);
        assert.calledWith(applicationHealthClientStub.getApplicationHealth, appUri);
      });
    });
  });

});
