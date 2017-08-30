'use strict';

const config = require('../config.js');

describe('config', () => {
  let cfg;

  describe('from environment variables', () => {

    context('environment variables not set', () => {
      before(() => {
        delete process.env.SECURED;
        delete process.env.JWTKEY;
        delete process.env.JWTALGO;
        delete process.env.DBALIAS;
        delete process.env.DB;
        delete process.env.AUTH_SERVER;
        delete process.env.CLIENT_ID;
        delete process.env.CLIENT_SECRET;
        delete process.env.CF_CLIENT_ID;
        delete process.env.CF_CLIENT_SECRET;
        delete process.env.LAST_RECORDED_GUID;
        delete process.env.MIN_INTERVAL_TIME;
        delete process.env.MAX_INTERVAL_TIME;
        delete process.env.GUID_MIN_AGE;
        delete process.env.ORGS_TO_REPORT;
        cfg = config.loadFromEnvironment();
      });

      it('contains default oauth values', () => {
        expect(cfg.oauth).to.deep.equal({
          enabled: false,
          jwtKey: undefined,
          jwtAlgorithm: undefined
        });
      });

      it('contains default cf values', () => {
        expect(cfg.cf).to.deep.equal({
          url: 'http://localhost:9882',
          clientID: undefined,
          clientSecret: undefined
        });
      });

      it('contains default collector values', () => {
        expect(cfg.collector).to.deep.equal({
          clientID: undefined,
          clientSecret: undefined
        });
      });

      it('contains default db values', () => {
        expect(cfg.db).to.deep.equal({
          url: 'http://localhost:5984'
        });
      });

      it('contains default polling values', () => {
        expect(cfg.polling).to.deep.equal({
          minInterval: 5000,
          maxInterval: 240000,
          orgs: undefined,
          events: {
            minAge: 60000,
            lastKnownGUID: undefined
          }
        });
      });
    });

    context('environment variables set', () => {
      before(() => {
        process.env.SECURED = 'true';
        process.env.JWTKEY = 'top-secret';
        process.env.JWTALGO = 'HS256';
        process.env.DBALIAS = 'my_db';
        process.env.MY_DB = 'https://services.example.org/mongo';
        process.env.AUTH_SERVER = 'https://example.org/v2/info';
        process.env.CLIENT_ID = 'abacus';
        process.env.CLIENT_SECRET = 'abacus-secret';
        process.env.CF_CLIENT_ID = 'abacus-cf';
        process.env.CF_CLIENT_SECRET = 'abacus-cf-secret';
        process.env.LAST_RECORDED_GUID = 'abcd-efgh';
        process.env.MIN_INTERVAL_TIME = '101';
        process.env.MAX_INTERVAL_TIME = '202';
        process.env.GUID_MIN_AGE = '303';
        process.env.ORGS_TO_REPORT = '["org1", "org2"]';
        cfg = config.loadFromEnvironment();
      });

      it('contains specified oauth values', () => {
        expect(cfg.oauth).to.deep.equal({
          enabled: true,
          jwtKey: 'top-secret',
          jwtAlgorithm: 'HS256'
        });
      });

      it('contains specified cf values', () => {
        expect(cfg.cf).to.deep.equal({
          url: 'https://example.org/v2/info',
          clientID: 'abacus-cf',
          clientSecret: 'abacus-cf-secret'
        });
      });

      it('contains specified collector values', () => {
        expect(cfg.collector).to.deep.equal({
          clientID: 'abacus',
          clientSecret: 'abacus-secret'
        });
      });

      it('contains specified db values', () => {
        expect(cfg.db).to.deep.equal({
          url: 'https://services.example.org/mongo'
        });
      });

      it('contains specified polling values', () => {
        expect(cfg.polling).to.deep.equal({
          minInterval: 101,
          maxInterval: 202,
          orgs: ['org1', 'org2'],
          events: {
            minAge: 303,
            lastKnownGUID: 'abcd-efgh'
          }
        });
      });

      context('when pollings orgs are invalid json', () => {
        before(() => {
          process.env.ORGS_TO_REPORT = 'not-a-json';
        });

        it('should error on loading', () => {
          expect(config.loadFromEnvironment).to.throw();
        });
      });
    });
  });
});
