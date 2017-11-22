'use strict';

describe('abacus-eureka', () => {
  const eureka = require('..');

  describe('server', () => {

    context('without EUREKA environment variable', () => {
      context('with server', () => {
        it('returns correct address', () => {
          expect(eureka.server('address')).to.equal('address/eureka/v2');
        });
      });

      context('without server', () => {
        it('returns undefined', () => {
          expect(eureka.server()).to.equal(undefined);
        });
      });
    });

    context('with EUREKA environment variable', () => {

      before(() => {
        process.env.EUREKA = 'eureka';
      });

      after(() => {
        delete process.env.EUREKA;
      });

      context('with server', () => {
        it('returns correct address', () => {
          expect(eureka.server('address')).to.equal('address/eureka/v2');
        });
      });

      context('without server', () => {
        it('returns urienv-backed value', () => {
          expect(eureka.server()).to.equal('http://localhost:9990/eureka/v2');
        });
      });
    });

  });
});
