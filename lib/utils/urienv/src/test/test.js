'use strict';

// Resolve URLs using the application environment

const vcap = require('abacus-vcapenv');
const urienv = require('..');

describe('abacus-urienv', () => {
  it('resolves URIs to the first application URI', () => {
    // Return VCAP env like when running in a Bluemix app instance
    vcap.env = stub().returns({
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

  it('resolves URIs to localhost', () => {
    // Return empty VCAP env like when running on localhost
    vcap.env = stub().returns({});

    const uris = urienv.resolve({
      abc: undefined,
      def: 9081,
      ghi: 'http://localhost:9082'
    });
    expect(uris.abc).to.equal('http://localhost:9080');
    expect(uris.def).to.equal('http://localhost:9081');
    expect(uris.ghi).to.equal('http://localhost:9082');
  });

  it('resolves default port from environment', () => {
    // Return empty VCAP env like when running on localhost
    vcap.env = stub().returns({});

    process.env.PORT = '9083';
    const uris = urienv.resolve({
      jkl: undefined
    });
    expect(uris.jkl).to.equal('http://localhost:9083');
    delete process.env.PORT;
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
});
