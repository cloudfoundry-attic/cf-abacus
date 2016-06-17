'use strict';

const _ = require('underscore');
const extend = _.extend;

// Mock the cluster module
const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Mock the batch module
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = spy((fn) => fn);

describe('Stalled usage', () => {
  let removeStalledUsage;

  const deleteModules = () => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('..')];
  };

  beforeEach(() => {
    deleteModules();
    removeStalledUsage = require('..').removeStalledUsage;
  });

  afterEach(() => {
    deleteModules();
    removeStalledUsage = undefined;
  });

  const runningAppUsage = {
    start: Date.now(),
    end: Date.now(),
    organization_id: 1,
    space_id: 1,
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 1,
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 1024
      },
      {
        measure: 'current_running_instances',
        quantity: 1
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  };

  const stoppedAppUsage = {
    start: Date.now(),
    end: Date.now(),
    organization_id: 1,
    space_id: 1,
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 1,
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 0
      },
      {
        measure: 'current_running_instances',
        quantity: 0
      },
      {
        measure: 'previous_instance_memory',
        quantity: 1024
      },
      {
        measure: 'previous_running_instances',
        quantity: 1
      }
    ]
  };

  const scaledAppUsage = {
    start: Date.now(),
    end: Date.now(),
    organization_id: 1,
    space_id: 1,
    consumer_id: 'app:1',
    resource_id: 'linux-container',
    plan_id: 'standard',
    resource_instance_id: 1,
    measured_usage: [
      {
        measure: 'current_instance_memory',
        quantity: 2048
      },
      {
        measure: 'current_running_instances',
        quantity: 2
      },
      {
        measure: 'previous_instance_memory',
        quantity: 0
      },
      {
        measure: 'previous_running_instances',
        quantity: 0
      }
    ]
  };

  const changeOrgId = (usage, guid) => {
    return extend({}, usage, { organization_id: guid });
  };

  context('single application', () => {
    context('stopped application', () => {
      const appUsage = [
        runningAppUsage, stoppedAppUsage
      ].reverse();

      it('removes all usage', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged.length).to.equal(0);
      });
    });

    context('stopped then started application', () => {
      const appUsage = [
        runningAppUsage, stoppedAppUsage, scaledAppUsage
      ].reverse();

      it('leaves last usage only', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged).to.deep.equal([scaledAppUsage]);
      });
    });

    context('multiple restarts, finally stopped', () => {
      const appUsage = [
        runningAppUsage, stoppedAppUsage,
        scaledAppUsage, stoppedAppUsage
      ].reverse();

      it('leaves last usage only', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged.length).to.equal(0);
      });
    });

    context('multiple restarts, finally started', () => {
      const appUsage = [
        runningAppUsage, stoppedAppUsage,
        scaledAppUsage, stoppedAppUsage,
        runningAppUsage
      ].reverse();

      it('leaves last usage only', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged).to.deep.equal([runningAppUsage]);
      });
    });
  });

  context('multiple applications', () => {
    const runningApp2Usage = changeOrgId(runningAppUsage, 2);
    const stoppedApp2Usage = changeOrgId(stoppedAppUsage, 2);
    const scaledApp2Usage = changeOrgId(scaledAppUsage, 2);

    context('both apps are stopped', () => {
      const app1Usage = [
        runningAppUsage, stoppedAppUsage
      ].reverse();
      const app2Usage = [
        runningApp2Usage, stoppedApp2Usage
      ].reverse();

      const appUsage = app1Usage.concat(app2Usage);

      it('removes all usage', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged.length).to.equal(0);
      });
    });

    context('both apps are started', () => {
      const app1Usage = [ runningAppUsage ];
      const app2Usage = [ runningApp2Usage ];
      const appUsage = app1Usage.concat(app2Usage);

      it('leaves last usage data for the 2 apps', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged).to.deep.equal([ runningAppUsage, runningApp2Usage ]);
      });
    });

    context('app1 is stopped, app2 is running', () => {
      const app1Usage = [
        runningAppUsage, stoppedAppUsage
      ].reverse();
      const app2Usage = [
        stoppedApp2Usage, runningApp2Usage
      ].reverse();

      const appUsage = app1Usage.concat(app2Usage);

      it('leaves last usage of app2 only', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged).to.deep.equal([runningApp2Usage]);
      });
    });

    context('app1 is started, app2 is scaled', () => {
      const app1Usage = [
        stoppedAppUsage, runningAppUsage
      ].reverse();
      const app2Usage = [
        stoppedApp2Usage, runningApp2Usage, scaledApp2Usage
      ].reverse();

      const appUsage = app1Usage.concat(app2Usage);

      it('leaves last usage only', () => {
        const purged = removeStalledUsage(appUsage);
        expect(purged).to.deep.equal([
          runningAppUsage, scaledApp2Usage
        ]);
      });
    });

  });
});
