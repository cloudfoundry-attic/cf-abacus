'use strict';

const _ = require('underscore');
const extend = _.extend;

const moment = require('abacus-moment');
const request = require('abacus-request');
const jwt = require('jsonwebtoken');

// Mock the cluster module
const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

// Spy the dbclient module
let deletePartitions;
const dbclient = require('abacus-dbclient');
const dbclientmock = extend({}, dbclient, {
  deletePartitions: (server, regex, cb) => deletePartitions(server, regex, cb)
});
require.cache[require.resolve('abacus-dbclient')].exports = dbclientmock;

const tokenSecret = 'secret';
const tokenAlgorithm = 'HS256';

const tokenPayload = {
  jti: '254abca5-1c25-40c5-99d7-2cc641791517',
  sub: 'abacus',
  authorities: [
    'abacus.usage.write',
    'abacus.usage.read'
  ],
  scope: [
    'abacus.usage.write',
    'abacus.usage.read'
  ],
  client_id: 'abacus',
  cid: 'abacus',
  azp: 'abacus',
  grant_type: 'client_credentials',
  rev_sig: '2cf89595',
  iat: 1456147679,
  exp: 1456190879,
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus',
    'abacus.usage'
  ]
};

const payload = (deletedPartitionsCount, deleteOldPartitionsErrors,
  retriesCount, deleteOldPartitionsError) => {
  return {
    housekeeper: {
      statistics: {
        tasks: {
          deleteOldPartitions: {
            deletedPartitionsCount: deletedPartitionsCount,
            errors: deleteOldPartitionsErrors
          }
        },
        retries: {
          count: retriesCount
        }
      },
      errors: {
        deleteOldPartitions: deleteOldPartitionsError
      }
    }
  };
};

describe('abacus-housekeeper', () => {
  let server;
  let housekeeper;
  let secured;
  let retentionPeriod;

  beforeEach(() => {
    process.env.SECURED = secured ? 'true' : 'false';
    process.env.JWTKEY = tokenSecret;
    process.env.JWTALGO = tokenAlgorithm;
    process.env.RETENTION_PERIOD = retentionPeriod;

    housekeeper = require('..');

    // Create a test housekeeper app
    const app = housekeeper();

    // Listen on an ephemeral port
    server = app.listen(0);
  });

  afterEach(() => {
    if (server)
      server.close();

    delete require.cache[require.resolve('..')];
  });

  context('on GET request without security', () => {
    before(() => secured = false);

    it('succeeds', (done) => {
      request.get('http://localhost::p/v1/housekeeper', {
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(payload(0, 0, 0, null));

        done();
      });
    });
  });

  context('on GET request with security', () => {
    before(() => secured = true);

    const signedToken = jwt.sign(tokenPayload, tokenSecret, {
      expiresIn: 43200
    });

    it('fails with 401 if no token', (done) => {
      request.get('http://localhost::p/v1/housekeeper', {
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(401);

        done();
      });
    });

    it('fails with 401 if the token is invalid', (done) => {
      request.get('http://localhost::p/v1/housekeeper', {
        headers: {
          authorization: 'bearer ' + 'invalid_token'
        },
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(401);

        done();
      });
    });

    it('succeeds if the token is valid', (done) => {
      request.get('http://localhost::p/v1/housekeeper', {
        headers: {
          authorization: 'bearer ' + signedToken
        },
        p: server.address().port
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(payload(0, 0, 0, null));

        done();
      });
    });

  });

  context('when running tasks', () => {
    before(() => {
      secured = false;
      retentionPeriod = 4;
    });

    it('runs all tasks and collects statistics', (done) => {
      deletePartitions = spy((server, regex, cb) => cb(null, ['abc-0-201703']));

      housekeeper.runTasks((err) => {
        expect(err).to.equal(undefined);
        expect(deletePartitions.callCount).to.equal(1);
        const m = moment.utc().startOf('month')
          .subtract(retentionPeriod + 1, 'months');
        expect(deletePartitions.args[0][1]).to.deep.equal(housekeeper.regex(m));

        request.get('http://localhost::p/v1/housekeeper', {
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(payload(1, 0, 1, null));

          done();
        });
      });
    });

    it('runs all tasks and reports errors', (done) => {
      deletePartitions = (server, regex, cb) => cb('Error');

      housekeeper.runTasks((err) => {
        expect(err).to.equal('Error');

        request.get('http://localhost::p/v1/housekeeper', {
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(payload(0, 1, 1, 'Error'));

          done();
        });
      });
    });
  });

  context('when generating a regex for moments', () => {
    it('generates a correct regex for 2017-03-20', () => {
      const m = moment.utc([2017, 2, 20]);
      expect(housekeeper.regex(m)).to.deep.equal(
        /.*-20((15|16)(0[1-9]|1[0-2])|17(01|02|03))/);
    });

    it('generates a correct regex for 2020-12-05', () => {
      const m = moment.utc([2020, 11, 5]);

      expect(housekeeper.regex(m)).to.deep.equal(
        /.*-20(15|16|17|18|19|20)(0[1-9]|1[0-2])/);
    });

    it('generates a correct regex for 2015-01-05', () => {
      const m = moment.utc([2015, 0, 5]);
      expect(housekeeper.regex(m)).to.deep.equal(
        /.*-201501/);
    });

  });
});
