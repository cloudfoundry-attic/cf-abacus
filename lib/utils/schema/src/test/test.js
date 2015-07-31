'use strict';

const schema = require('..');

describe('cf-abacus-schema', () => {
    it('validate a valid data object', () => {
        const middleware = schema.validate({required: true, type: 'object', properties: {x: {required: true, type: 'number'}}});
        const req = {body: {x: 1}};
        const res = {};
        res.status = stub().returns(res);
        res.send = stub().returns(res);
        const next = spy();

        middleware(req, res, next);

        expect(next.called).to.equal(true);
        expect(res.status.called).to.equal(false);
        expect(res.send.called).to.equal(false);
    });

    it('validate an invalid data object that is missing a required property', () => {
        const middleware = schema.validate({required: true, type: 'object', properties: {y: {required: true, type: 'string'}}});
        const req = {body: {}};
        const res = {};
        res.status = stub().returns(res);
        res.send = stub().returns(res);
        const next = spy();

        middleware(req, res, next);

        expect(next.called).to.equal(false);
        expect(res.status.args[0]).to.deep.equal([400]);
        expect(res.send.args[0]).to.deep.equal([[{field: 'data.y', message: 'is required', value: undefined}]]);
    });
});

