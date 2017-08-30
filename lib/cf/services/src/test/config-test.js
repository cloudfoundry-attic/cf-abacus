'use strict';

const config = require('../config.js');

describe('config', () => {
  let cfg;

  describe('from environment variables', () => {

    context('environment variables not set', () => {
      before(() => {
        delete process.env.SERVICES;
        cfg = config.loadFromEnvironment();
      });

      it('contains default services', () => {
        expect(cfg.services).to.equal(undefined);
      });
    });

    context('environment variables set', () => {
      before(() => {
        process.env.SERVICES = `{
          "service1":{"plans":["plan1","plan2"]},
          "service2":{"plans":["plan2"]}
        }`;
        cfg = config.loadFromEnvironment();
      });

      it('contains specified services values', () => {
        expect(cfg.services).to.deep.equal({
          service1:{
            plans: ['plan1', 'plan2']
          },
          service2:{
            plans: ['plan2']
          }
        });
      });

      context('when services are invalid json', () => {
        before(() => {
          process.env.SERVICES = 'not-a-json';
        });

        it('should error on loading', () => {
          expect(config.loadFromEnvironment).to.throw();
        });
      });
    });
  });
});
