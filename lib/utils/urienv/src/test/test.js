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
  });

  context('in Cloud Foundry environment', () => {
    it('resolves URIs to the first application URI', () => {
      // Return VCAP env like when running in a Bluemix app instance
      vcapenv.app = stub().returns({
        application_uris: ['test.ng.bluemix.net',
          'test.mybluemix.net'
        ]
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
          application_uris: ['test.ng.bluemix.net',
            'test.mybluemix.net'
          ]
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

    context('when service instance is bound', () => {
      const dbURI = 'postgres://user:pwd@babar.elephantsql.com:5432/seilbmbd';
      const services = {
        elephantsql: [
          {
            name: 'elephantsql',
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

        // Return VCAP env like when running in a Cloud Foundry app instance
        vcapenv.app = stub().returns({
          application_uris: ['test.ng.bluemix.net',
            'test.mybluemix.net'
          ]
        });

        uris = urienv.resolve({
          elephantsql: 9081,
          abc: 'http://localhost:9082'
        });
      });

      afterEach(() => {
        delete process.env.VCAP_SERVICES;
      });

      it('resolves URIs from service instance URI first', () => {
        expect(uris.elephantsql).to.equal(dbURI);
      });

      it('resolves URIs to the first application URI', () => {
        expect(uris.abc).to.equal('https://abc.ng.bluemix.net');
      });
    });
  });
});

