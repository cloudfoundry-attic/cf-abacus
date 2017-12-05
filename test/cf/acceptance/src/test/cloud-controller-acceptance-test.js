'use strict';

const env = {
  api: process.env.CF_API,
  user: process.env.CF_ADMIN_USER,
  password: process.env.CF_ADMIN_PASSWORD,
  org: process.env.TEST_ORG,
  space: process.env.TEST_SPACE,
  cloudControllerClientId: process.env.BRIDGE_CLIENT_ID,
  cloudControllerClientSecret: process.env.BRIDGE_CLIENT_SECRET
};

const oauth = require('abacus-oauth');
// FIXME: check if it make sense to extract eventReader to a dedicated module.
const createEventReader = require('abacus-bridge').eventReader;

const cmdline = require('abacus-cmdline').cfutils(env.api, env.user, env.password);

const statistics = {
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

describe('app_usage_events', () => {

  const getLastEventGuid = (token, cb) => {
    const eventReader = createEventReader({
      url: '/v2/app_usage_events',
      'order-direction': 'desc',
      minAge: 0,
      token: token,
      statistics
    });

    let finished = false;
    eventReader.poll((event, eventProcessed) => {
      if (!finished) {
        cb(event.metadata.guid);
        finished = true;
      }
    });
  };

  it('test', (done) => {

    cmdline.target(env.org, env.space);
    cmdline.deployApplication('staticapp', `-p ${__dirname}/static-app`);
    cmdline.deleteApplication('staticapp');

    const token = oauth.cache(
      env.api,
      env.cloudControllerClientId,
      env.cloudControllerClientSecret
    );

    // FIXME
    process.env.API = process.env.CF_API;
    process.env.SKIP_SSL_VALIDATION = 'true';

    // FIXME - use generators
    token.start((err) => {

      getLastEventGuid(token, (guid) => {
        done();
        const eventReader = createEventReader({
          url: `/v2/app_usage_events?after_guid=${guid}`,
          url: '/v2/app_usage_events',
          'order-direction': 'asc',
          minAge: 0,
          token: token,
          statistics
        });

        eventReader.poll((event, cb) => {
          // console.log('======');
          // console.log(event);
          if (event.entity.org_guid === env.org && entity.entity.state === 'STARTED')
            done();

          cb();
        }).on('finished', (err) => {
          done(new Error('Event not found.'));
        });
      });
    });


  });

});
