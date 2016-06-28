'use strict';

// CloudFoundry environment and app instance utilities.

// Mock some of the underscore functions used by the tested module
const _ = require('underscore');
_.memoize = spy((f, k) => f);

const vcapenv = require('..');

describe('abacus-vcapenv', () => {
  it('returns the VCAP_APPLICATION env var', () => {
    // Set VCAP_APPLICATION env variable like when running on CF
    process.env.VCAP_APPLICATION =
      '{ "name": "foo-1", "instance_id": "abcd", "instance_index": 12 }';

    // Expect the app info and instance id to be parsed from the
    // VCAP_APPLICATION env variable
    expect(vcapenv.app().instance_id).to.equal('abcd');
    expect(vcapenv.appname()).to.equal('foo');
    expect(vcapenv.appindex()).to.equal('1');
    expect(vcapenv.iid()).to.equal('abcd');
    expect(vcapenv.iindex()).to.equal('12');
  });

  it('returns a default empty VCAP_APPLICATION env var', () => {
    // Unset VCAP_APPLICATION env variable, like when running on localhost
    delete process.env.VCAP_APPLICATION;
    process.env.APP_NAME = 'bar';
    process.env.APP_INDEX = '2';

    // Expect default app info and instance id
    expect(vcapenv.app()).to.equal(undefined);
    expect(vcapenv.appname()).to.equal('bar');
    expect(vcapenv.appversion()).to.equal(
      require('../../package.json').version);
    expect(vcapenv.appindex()).to.equal('2');
    expect(vcapenv.iid()).to.equal(process.pid.toString());
    expect(vcapenv.iindex()).to.equal('0');
  });

  it('returns the CF_INSTANCE address and ports', () => {
    // Set CF_INSTANCE env variables like when running on CF
    process.env.CF_INSTANCE_IP = '192.168.100.1';
    process.env.CF_INSTANCE_PORTS =
      '[{ "external": 5678, "internal": 6789 }]';

    // Expect the instance address and ports to be retrieved from the env
    expect(vcapenv.iaddress()).to.equal('192.168.100.1');
    expect(vcapenv.iports()).to.deep.equal([{
      external: 5678,
      internal: 6789
    }]);
    expect(vcapenv.iport()).to.equal(5678);
  });

  it('returns default instance address and port', () => {
    // Set CF_INSTANCE env variables like when running on CF
    delete process.env.CF_INSTANCE_IP;
    delete process.env.CF_INSTANCE_PORTS;
    process.env.HOST = '10.0.0.1';
    process.env.PORT = '4567';

    // Expect default instance address and port
    expect(vcapenv.iaddress()).to.equal('10.0.0.1');
    expect(vcapenv.iports()).to.equal(undefined);
    expect(vcapenv.iport()).to.equal(4567);
  });

  context('when no service instances exist', () => {
    beforeEach(() => {
      // Unset VCAP_SERVICES env variable, like when running on localhost
      delete process.env.VCAP_SERVICES;
    });

    it('returns undefined if no service instances are present', () => {
      // Expect the service instances to be parsed from VCAP_SERVICES
      expect(vcapenv.serviceInstance('rediscloud-1')).to.eql(undefined);
      expect(vcapenv.serviceInstance('unknown')).to.eql(undefined);
    });

    it('returns a default empty service instance key', () => {
      expect(vcapenv.serviceInstanceCredentials('rediscloud-1', 'host')).
        to.equal(undefined);
      expect(vcapenv.serviceInstanceCredentials('unknown', 'host')).
        to.equal(undefined);
    });

    it('returns a default empty VCAP_SERVICES env var', () => {
      expect(vcapenv.services()).to.equal(undefined);
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
      expect(vcapenv.services()).to.eql(services);
    });

    it('returns the service instance', () => {
      // Set VCAP_SERVICES env variable like when running on Cloud Foundry
      process.env.VCAP_SERVICES = JSON.stringify(services);

      // Expect the service instances to be parsed from VCAP_SERVICES
      expect(vcapenv.serviceInstance('rediscloud-1')).to.eql(serviceInstance);
    });

    it('returns undefined if service instance is unknown', () => {
      // Set VCAP_SERVICES env variable like when running on Cloud Foundry
      process.env.VCAP_SERVICES = JSON.stringify(services);

      // Expect the service instances to be parsed from VCAP_SERVICES
      expect(vcapenv.serviceInstance('unknown')).to.eql(undefined);
    });


    it('returns a service instance key', () => {
      // Set VCAP_SERVICES env variable like when running on Cloud Foundry
      process.env.VCAP_SERVICES = JSON.stringify(services);

      // Expect the credentials key to be parsed from VCAP_SERVICES
      expect(vcapenv.serviceInstanceCredentials('rediscloud-1', 'host')).
        to.equal(serviceInstance.credentials.host);
    });
  });

  it.only('returns app and instance info in headers', () => {
    const middleware = vcapenv.headers();
    const req = {
      path: '/foo'
    };
    const res = {
      header: spy(),
      send: spy()
    };
    const next = spy();

    const appv = require('../../package.json').version;

    // HTTP responses have X headers with the app and instance info
    process.env.VCAP_APPLICATION = '{\n' +
      '  "name": "foo-1",\n' +
      '  "instance_id": "abcd",\n' +
      '  "instance_index": 2\n' +
    '}';
    middleware(req, res, next);
    expect(res.header.args[0]).to.deep.equal(['X-App-Name', 'foo']);
    expect(res.header.args[1]).to.deep.equal(['X-App-Version', appv]);
    expect(res.header.args[2]).to.deep.equal(['X-App-Index', '1']);
    expect(res.header.args[3]).to.deep.equal(['X-Instance-Id', 'abcd']);
    expect(res.header.args[4]).to.deep.equal(['X-Instance-Index', '2']);
    expect(next.args.length).to.equal(1);

    // or the process id when running outside of CF
    delete process.env.VCAP_APPLICATION;
    process.env.APP_NAME = 'bar';
    process.env.APP_INDEX = '2';
    process.env.INSTANCE_INDEX = '1';
    middleware(req, res, next);
    expect(res.header.args[5]).to.deep.equal(['X-App-Name', 'bar']);
    expect(res.header.args[6]).to.deep.equal(['X-App-Version', appv]);
    expect(res.header.args[7]).to.deep.equal(['X-App-Index', '2']);
    expect(res.header.args[8])
      .to.deep.equal(['X-Instance-Id', process.pid.toString()]);
    expect(res.header.args[9]).to.deep.equal(['X-Instance-Index', '1']);
    expect(next.args.length).to.equal(2);
  });
});

