'use strict';

// CloudFoundry environment and app instance utilities.

// Mock some of the underscore functions used by the tested module
const _ = require('underscore');
_.memoize = spy((f, k) => f);

const vcap = require('..');

describe('abacus-vcapenv', () => {
  it('returns the VCAP_APPLICATION env var', () => {
    // Set VCAP_APPLICATION env variable like when running on Bluemix
    process.env.VCAP_APPLICATION = '{ "instance_id": "abcd" }';

    // Expect the instance id to be parsed from VCAP_APPLICATION
    expect(vcap.env().instance_id).to.equal('abcd');
  });

  it('returns a default empty VCAP_APPLICATION env var', () => {
    // Unset VCAP_APPLICATION env variable, like when running on localhost
    delete process.env.VCAP_APPLICATION;

    // Here we don't have an instance id
    expect(vcap.env()).to.equal(undefined);
  });

  context('when no service instances exist', () => {
    beforeEach(() => {
      // Unset VCAP_SERVICES env variable, like when running on localhost
      delete process.env.VCAP_SERVICES;
    });

    it('returns undefined if no service instances are present', () => {
      // Expect the service instances to be parsed from VCAP_SERVICES
      expect(vcap.serviceInstance('rediscloud-1')).to.eql(undefined);
      expect(vcap.serviceInstance('unknown')).to.eql(undefined);
    });

    it('returns a default empty service instance key', () => {
      expect(vcap.serviceInstanceCredentials('rediscloud-1', 'host')).
        to.equal(undefined);
      expect(vcap.serviceInstanceCredentials('unknown', 'host')).
        to.equal(undefined);
    });

    it('returns a default empty VCAP_SERVICES env var', () => {
      expect(vcap.services()).to.equal(undefined);
    });
  });

  context('when service instance is bound', () => {
    const serviceInstance = {
      name: 'rediscloud-1',
      label: 'rediscloud',
      plan: '20mb',
      credentials: {
        port: '6379',
        host: 'pub-redis-6379.us-east-1-2.3.ec2.redislabs.com',
        password: '1M5zd3QfWi9nUyya'
      }
    };
    const services = {
      rediscloud: [
        serviceInstance
      ]
    };

    it('returns the VCAP_SERVICES env var', () => {
      // Set VCAP_SERVICES env variable like when running on Cloud Foundry
      process.env.VCAP_SERVICES = JSON.stringify(services);

      // Expect the service info to be parsed from VCAP_SERVICES
      expect(vcap.services()).to.eql(services);
    });

    it('returns the service instance', () => {
      // Set VCAP_SERVICES env variable like when running on Cloud Foundry
      process.env.VCAP_SERVICES = JSON.stringify(services);

      // Expect the service instances to be parsed from VCAP_SERVICES
      expect(vcap.serviceInstance('rediscloud-1')).to.eql(serviceInstance);
    });

    it('returns undefined if service instance is unknown', () => {
      // Set VCAP_SERVICES env variable like when running on Cloud Foundry
      process.env.VCAP_SERVICES = JSON.stringify(services);

      // Expect the service instances to be parsed from VCAP_SERVICES
      expect(vcap.serviceInstance('unknown')).to.eql(undefined);
    });


    it('returns a service instance key', () => {
      // Set VCAP_SERVICES env variable like when running on Cloud Foundry
      process.env.VCAP_SERVICES = JSON.stringify(services);

      // Expect the credentials key to be parsed from VCAP_SERVICES
      expect(vcap.serviceInstanceCredentials('rediscloud-1', 'host')).
        to.equal(serviceInstance.credentials.host);
    });
  });

  it('sends X-Instance-Id and X-Instance-Index headers', () => {
    const middleware = vcap.headers();
    const req = {
      path: '/foo'
    };
    const res = {
      header: spy(),
      send: spy()
    };
    const next = spy();

    // HTTP responses have an X-Instance-Id header with the VCAP instance id
    process.env.VCAP_APPLICATION = '{\n' +
      '  "instance_id": "abcd",\n' +
      '  "instance_index": 2\n' +
    '}';
    middleware(req, res, next);
    expect(res.header.args[0]).to.deep.equal(['X-Instance-Id', 'abcd']);
    expect(res.header.args[1]).to.deep.equal(['X-Instance-Index', '2']);
    expect(next.args.length).to.equal(1);

    // or the process id when running outside of Bluemix
    delete process.env.VCAP_APPLICATION;
    middleware(req, res, next);
    expect(res.header.args[2]).to.deep.equal(['X-Instance-Id', process.pid
      .toString()
    ]);
    expect(res.header.args[3]).to.deep.equal(['X-Instance-Index', '0']);
    expect(next.args.length).to.equal(2);
  });
});

