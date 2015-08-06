'use strict';

const schema = require('..');

const types = schema.types;

describe('abacus-schema', () => {
  it('validate a data object that matches a schema', () => {
    const validate = schema.validator.middleware(types.object({
      x: types.number()
    }));

    const req = {
      body: {
        x: 1
      }
    };
    const res = {};
    res.status = stub().returns(res);
    res.send = stub().returns(res);
    const next = spy();

    validate(req, res, next);

    expect(next.called).to.equal(true);
    expect(res.status.called).to.equal(false);
    expect(res.send.called).to.equal(false);
  });

  it('validate a data object that does not match a schema', () => {
    const validate = schema.validator.middleware(types.object({
      a: types.string(),
      b: types.time(),
      c: types.enumType(['X', 'Y'], 'Y'),
      d: types.arrayOf(types.number())
    }, ['a', 'b', 'd']));

    const req = {
      body: {
        b: 1.23,
        c: 'Z',
        d: [1, 'x'],
        y: 1
      }
    };
    const res = {};
    res.status = stub().returns(res);
    res.send = stub().returns(res);
    const next = spy();

    validate(req, res, next);

    expect(next.called).to.equal(false);
    expect(res.status.args[0]).to.deep.equal([400]);
    expect(res.send.args[0]).to.deep.equal([
      [
        {
          field: 'data.a',
          message: 'is required',
          value: {
            b: 1.23,
            c: 'Z',
            d: [1, 'x'],
            y: 1
          }
        },
        {
          field: 'data',
          message: 'has additional properties',
          value: 'data.y'
        },
        {
          field: 'data.b',
          message: 'is the wrong type',
          value: 1.23
        },
        {
          field: 'data.c',
          message: 'must be an enum value',
          value: 'Z'
        },
        {
          field: 'data.d.1',
          message: 'is the wrong type',
          value: 'x'
        }]
    ]);
  });
});

