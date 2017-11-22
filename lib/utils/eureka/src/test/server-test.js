'use strict';

describe('abacus-eureka', () => {
  let eureka;

  const vcapAppEnv = `{
    "application_id": "1caf6cd4-4a35-481d-a9ee-f47830897c0f",
    "application_name": "abacus-eureka-plugin",
    "application_uris": [
     "abacus-eureka-plugin.cf.domain.com"
    ],
    "application_version": "29b2756f-88c0-4744-82be-31e30f0a6d57",
    "cf_api": "https://api.cf.domain.com",
    "limits": {
     "disk": 512,
     "fds": 16384,
     "mem": 512
    },
    "name": "abacus-eureka-plugin",
    "space_id": "b165cbc1-5196-4f64-8010-0259a05a8643",
    "space_name": "abacus",
    "uris": [
     "abacus-eureka-plugin.cf.domain.com"
    ],
    "users": null,
    "version": "29b2756f-88c0-4744-82be-31e30f0a6d57"
  }`;

  describe('server', () => {

    beforeEach(() => {
      delete require.cache[require.resolve('abacus-vcapenv')];
      delete require.cache[require.resolve('abacus-urienv')];
      delete require.cache[require.resolve('..')];
      delete process.env.VCAP_APPLICATION;
      delete process.env.EUREKA;
    });

    context('without EUREKA environment variable', () => {
      context('locally', () => {
        beforeEach(() => {
          eureka = require('..');
        });

        context('with server', () => {
          it('returns correct address', () => {
            expect(eureka.server('address')).to.equal('address/eureka/v2');
          });
        });

        context('without server', () => {
          it('returns correct address', () => {
            expect(eureka.server()).to.equal('http://localhost:9990/eureka/v2');
          });
        });
      });

      context('on CF', () => {
        beforeEach(() => {
          process.env.VCAP_APPLICATION = vcapAppEnv;
          eureka = require('..');
        });

        context('with server', () => {
          it('returns correct address', () => {
            expect(eureka.server('address')).to.equal('address/eureka/v2');
          });
        });

        context('without server', () => {
          it('returns default urienv-backed domain', () => {
            expect(eureka.server()).to.equal(
              'https://eureka.cf.domain.com/eureka/v2'
            );
          });
        });
      });
    });

    context('with EUREKA environment variable', () => {
      context('locally', () => {
        beforeEach(() => {
          process.env.EUREKA = 'eureka';
          eureka = require('..');
        });

        context('with server', () => {
          it('returns correct address', () => {
            expect(eureka.server('address')).to.equal('address/eureka/v2');
          });
        });

        context('without server', () => {
          it('returns urienv-backed value', () => {
            expect(eureka.server()).to.equal('eureka/eureka/v2');
          });
        });
      });

      context('on CF', () => {
        beforeEach(() => {
          process.env.EUREKA = 'schema://host';
          process.env.VCAP_APPLICATION = vcapAppEnv;
          eureka = require('..');
        });

        context('with server', () => {
          it('returns correct address', () => {
            expect(eureka.server('address')).to.equal('address/eureka/v2');
          });
        });

        context('without server', () => {
          it('returns urienv-backed value', () => {
            expect(eureka.server()).to.equal('schema://host/eureka/v2');
          });
        });
      });
    });

  });
});
