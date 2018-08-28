'use strict';

// Resolve URLs using the application environment

const vcapenv = require('abacus-vcapenv');
const urienv = require('..');

describe('abacus-urienv', () => {
  context('in local environment', () => {
    it('resolves URIs to localhost', () => {
      // Return empty VCAP env like when running on localhost
      vcapenv.app = stub().returns({});

      const uris = urienv.resolve({
        abc: undefined,
        def: 9081,
        ghi: 'http://localhost:9082'
      });
      expect(uris.abc).to.equal('http://localhost:9080');
      expect(uris.def).to.equal('http://localhost:9081');
      expect(uris.ghi).to.equal('http://localhost:9082');
    });

    it('resolves URIs to localhost with multiple ports', () => {
      // Return empty VCAP env like when running on localhost
      vcapenv.app = stub().returns({});

      const uris = urienv.resolve({
        def: [9080, 9081]
      });
      expect(uris.def).to.deep.equal(['http://localhost:9080', 'http://localhost:9081']);
    });

    it('resolves URIs from browser location', () => {
      process.browser = true;
      global.window = {
        location: {
          protocol: 'https:',
          hostname: 'xyz.net',
          port: 9084
        }
      };

      const uris = urienv.resolve({
        mno: undefined
      });
      expect(uris.mno).to.equal('https://xyz.net:9084');

      process.browser = false;
      delete global.window;
    });

    context('when environment contains the alias', () => {
      const envURI = 'https://xyz.net:9084';
      let uris;

      beforeEach(() => {
        process.env.MNO = envURI;
        uris = urienv.resolve({
          mno: 9084
        });
      });

      afterEach(() => {
        delete process.env.MNO;
      });

      it('resolves URIs from environment', () => {
        expect(uris.mno).to.equal(envURI);
      });
    });

    context('when environment contains the alias as a list', () => {
      const envURI = 'https://xyz.net:9084|https://xyz.net:9085';
      let uris;

      beforeEach(() => {
        process.env.MNO = envURI;
        uris = urienv.resolve({
          mno: 9084
        });
      });

      afterEach(() => {
        delete process.env.MNO;
      });

      it('resolves URIs from environment', () => {
        expect(uris.mno).to.deep.equal(['https://xyz.net:9084', 'https://xyz.net:9085']);
      });
    });

    context('with skipMissing', () => {
      const envURI = 'https://xyz.net:9084';
      let uris;

      beforeEach(() => {
        process.env.MNO = envURI;
        uris = urienv.resolve({
          abc: 123,
          mno: 9084
        }, {
          skipMissing: true
        });
      });

      afterEach(() => {
        delete process.env.MNO;
      });

      it('resolves URIs missing from environment to localhost', () => {
        expect(uris.abc).to.equal('http://localhost:123');
        expect(uris.mno).to.deep.equal(envURI);
      });
    });
  });

  context('in Cloud Foundry environment', () => {

    context('with default configuration', () => {
      it('resolves URIs to the first application domain', () => {
        // Return VCAP env like when running in a Bluemix app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.ng.bluemix.net', 'test.mybluemix.net']
        });

        const uris = urienv.resolve({
          abc: undefined,
          def: 9081,
          ghi: 'http://localhost:9082'
        });
        expect(uris.abc).to.equal('https://abc.ng.bluemix.net');
        expect(uris.def).to.equal('https://def.ng.bluemix.net');
        expect(uris.ghi).to.equal('https://ghi.ng.bluemix.net');
      });
    });

    context('with skipMissing configuration', () => {
      before(() => {
        process.env.TEST = 'test';
      });

      after(() => {
        delete process.env.TEST;
      });

      it('does not resolve URIs not present in environment', () => {
        // Return VCAP env like when running in a SAP CP app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.cf.com', 'test.cf.com']
        });

        const uris = urienv.resolve({
          abc: undefined,
          def: 9081,
          ghi: 'http://localhost:9082',
          test: undefined
        }, {
          skipMissing: true
        });
        expect(uris.abc).to.equal(undefined);
        expect(uris.def).to.equal(undefined);
        expect(uris.ghi).to.equal(undefined);
        expect(uris.test).to.equal('https://test.cf.com');
      });
    });

    it('resolves default port from environment', () => {
      // Return empty VCAP env like when running on localhost
      vcapenv.app = stub().returns({});

      process.env.PORT = '9083';
      const uris = urienv.resolve({
        jkl: undefined
      });
      expect(uris.jkl).to.equal('http://localhost:9083');
      delete process.env.PORT;
    });

    context('when environment contains the alias', () => {
      const envURI = 'https://xyz.net:9084';
      let uris;

      beforeEach(() => {
        process.env.MNO = envURI;

        // Return VCAP env like when running in a Cloud Foundry app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.ng.bluemix.net', 'test.mybluemix.net']
        });

        uris = urienv.resolve({
          mno: 9084
        });
      });

      afterEach(() => {
        delete process.env.MNO;
      });

      it('resolves URIs from environment', () => {
        expect(uris.mno).to.equal(envURI);
      });
    });

    context('when environment contains primary domain', () => {
      beforeEach(() => {
        process.env.PRIMARY_DOMAIN = 'primary.net';
      });

      afterEach(() => {
        delete process.env.PRIMARY_DOMAIN;
      });

      it('resolves URIs from environment', () => {
        // Return VCAP env like when running in a Cloud Foundry app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.ng.bluemix.net', 'test.mybluemix.net', 'test.primary.net']
        });

        const uris = urienv.resolve({
          abc: 9084
        });
        expect(uris.abc).to.deep.equal('https://abc.primary.net');
      });

      it('resolves URIs from environment and ignores invalid config', () => {
        // Return VCAP env like when running in a Cloud Foundry app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.ng.bluemix.net', 'test.mybluemix.net']
        });

        const uris = urienv.resolve({
          abc: 9084
        });
        expect(uris.abc).to.deep.equal('https://abc.ng.bluemix.net');
      });
    });

    context('when environment contains the alias as a list', () => {
      const envURI = 'https://xyz.net:9084|https://xyz.net:9085';
      let uris;

      beforeEach(() => {
        process.env.MNO = envURI;

        // Return VCAP env like when running in a Cloud Foundry app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.ng.bluemix.net', 'test.mybluemix.net']
        });

        uris = urienv.resolve({
          mno: 9084
        });
      });

      afterEach(() => {
        delete process.env.MNO;
      });

      it('resolves URIs from environment', () => {
        expect(uris.mno).to.deep.equal(['https://xyz.net:9084', 'https://xyz.net:9085']);
      });
    });

    context('when a single service instances is bound', () => {
      const dbURI = 'postgres://user:pwd@babar.elephantsql.com:5432/seilbmbd';
      const services = {
        elephantsql: [
          {
            name: 'elephantsql-1',
            label: 'elephantsql',
            plan: 'turtle',
            credentials: {
              uri: dbURI
            }
          }
        ]
      };
      let uris;

      beforeEach(() => {
        // Return VCAP env like when running with service instances
        process.env.VCAP_SERVICES = JSON.stringify(services);

        process.env.ELEPHANTSQL = 'postgres://babar.elephantsql.com:5432';

        // Return VCAP env like when running in a Cloud Foundry app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.ng.bluemix.net', 'test.mybluemix.net']
        });

        uris = urienv.resolve({
          elephantsql: 9081,
          abc: 'http://localhost:9082'
        });
      });

      afterEach(() => {
        delete process.env.VCAP_SERVICES;
        delete process.env.ELEPHANTSQL;
      });

      it('resolves URIs from service instance URI first', () => {
        expect(uris.elephantsql).to.deep.equal([dbURI]);
      });

      it('resolves URIs to the first application URI', () => {
        expect(uris.abc).to.equal('https://abc.ng.bluemix.net');
      });
    });

    context('when multiple service instances are bound', () => {
      const dbURI0 = 'postgres://user:pwd@babar.elephantsql.com:5432/seilbmbd0';
      const dbURI1 = 'postgres://user:pwd@babar.elephantsql.com:5432/seilbmbd1';
      const services = {
        elephantsql: [
          {
            name: 'elephantsql-1',
            label: 'elephantsql',
            plan: 'turtle',
            credentials: {
              uri: dbURI1
            }
          },
          {
            name: 'elephantsql-0',
            label: 'elephantsql',
            plan: 'turtle',
            credentials: {
              uri: dbURI0
            }
          }
        ]
      };
      let uris;

      beforeEach(() => {
        // Return VCAP env like when running with service instances
        process.env.VCAP_SERVICES = JSON.stringify(services);

        uris = urienv.resolve({
          elephantsql: 9081
        });
      });

      afterEach(() => {
        delete process.env.VCAP_SERVICES;
      });

      it('resolves URIs from all service instances', () => {
        expect(uris.elephantsql).to.deep.equal([dbURI0, dbURI1]);
      });
    });
  });
});
