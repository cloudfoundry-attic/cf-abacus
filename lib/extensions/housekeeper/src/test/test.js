'use strict';

const { extend } = require('underscore');

const moment = require('abacus-moment');
const request = require('abacus-request');
const jwt = require('jsonwebtoken');

// Spy dbclient's deletePartitions
let deletePartitions = spy((server, regex, cb) => cb(null, ['abc-0-201703']));
const dbclient = require('abacus-dbclient');
const dbclientmock = extend({}, dbclient, {
  deletePartitions: (server, regex, cb) => deletePartitions(server, regex, cb)
});
require.cache[require.resolve('abacus-dbclient')].exports = dbclientmock;

const defaultDeletedPartitionsCount = 1;
const defaultRetriesCount = 1;

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
  iss: 'https://localhost:1234/oauth/token',
  zid: 'uaa',
  aud: [
    'abacus',
    'abacus.usage'
  ]
};

const payload = (deletedPartitionsCount, deleteOldPartitionsErrors, retriesCount, deleteOldPartitionsError) => ({
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
});

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

    deletePartitions.resetHistory();

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
        expect(val.body).to.deep.equal(payload(defaultDeletedPartitionsCount, 0, defaultRetriesCount, null));

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
        expect(val.body).to.deep.equal(payload(defaultDeletedPartitionsCount, 0, defaultRetriesCount, null));

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
      housekeeper.runTasks((err) => {
        expect(err).to.equal(undefined);
        expect(deletePartitions.callCount).to.equal(2);
        const m = moment.utc().startOf('month').subtract(retentionPeriod + 1, 'months');
        expect(deletePartitions.args[0][1]).to.deep.equal(housekeeper.regex(m));

        request.get('http://localhost::p/v1/housekeeper', {
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(payload(2, 0, 2, null));

          done();
        });
      });
    });

    it('runs all tasks and reports errors', (done) => {
      deletePartitions = spy((server, regex, cb) => cb('Error'));

      housekeeper.runTasks((err) => {
        expect(err).to.equal('Error');

        request.get('http://localhost::p/v1/housekeeper', {
          p: server.address().port
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal(payload(defaultDeletedPartitionsCount, 1, 2, 'Error'));

          done();
        });
      });
    });
  });

  context('when generating a regex for moments', () => {
    it('generates a correct regex for 2017-03-20', () => {
      const m = moment.utc([2017, 2, 20]);
      expect(
        housekeeper.regex(m)
      ).to.deep.equal(
        /.*-20((15|16)(0[1-9]|1[0-2])|17(01|02|03))/
      );
    });

    it('generates a correct regex for 2020-12-05', () => {
      const m = moment.utc([2020, 11, 5]);
      expect(
        housekeeper.regex(m)
      ).to.deep.equal(
        /.*-20(15|16|17|18|19|20)(0[1-9]|1[0-2])/
      );
    });

    it('generates a correct regex for 2015-01-05', () => {
      const m = moment.utc([2015, 0, 5]);
      expect(
        housekeeper.regex(m)
      ).to.deep.equal(
        /.*-201501/
      );
    });

  });
});
