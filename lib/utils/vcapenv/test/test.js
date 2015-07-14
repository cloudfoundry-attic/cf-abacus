'use strict';

// CloudFoundry environment and app instance utilities.

// Mock some of the underscore functions used by the tested module
const _ = require('underscore');
_.memoize = spy((f, k) => f);

const vcap = require('..');

describe('cf-abacus-vcapenv', () => {
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

    it('sends X-Instance-Id and X-Instance-Index headers', () => {
        const middleware = vcap.headers();
        const req = { path: '/foo' };
        const res = { header: spy(), send: spy() };
        const next = spy();

        // HTTP responses have an X-Instance-Id header with the VCAP instance id
        process.env.VCAP_APPLICATION = '{ "instance_id": "abcd", "instance_index": 2 }';
        middleware(req, res, next);
        expect(res.header.args[0]).to.deep.equal(['X-Instance-Id', 'abcd']);
        expect(res.header.args[1]).to.deep.equal(['X-Instance-Index', '2']);
        expect(next.args.length).to.equal(1);

        // or the process id when running outside of Bluemix
        delete process.env.VCAP_APPLICATION;
        middleware(req, res, next);
        expect(res.header.args[2]).to.deep.equal(['X-Instance-Id', process.pid.toString()]);
        expect(res.header.args[3]).to.deep.equal(['X-Instance-Index', '0']);
        expect(next.args.length).to.equal(2);
    });
});

