'use strict';

// Data schema definition and validation utilities.

const schema = require('..');
const graphql = require('graphql');

const string = schema.string;
const time = schema.time;
const number = schema.number;
const arrayOf = schema.arrayOf;
const enumType = schema.enumType;
const objectType = schema.objectType;
const required = schema.required;

describe('abacus-schema', () => {
  it('converts a schema to a JSON schema', () => {
    const json = schema(objectType('doc', {
      a: required(string()),
      b: required(time()),
      c: enumType('xy', ['X', 'Y'], 'Y'),
      d: required(arrayOf(number()))
    }));

    expect(json).to.deep.equal({
      title: 'doc',
      description: undefined,
      type: 'object',
      properties: {
        a: {
          type: 'string'
        },
        b: {
          type: 'integer',
          format: 'utc-millisec'
        },
        c: {
          title: 'xy',
          description: undefined,
          enum: ['X', 'Y'],
          default: 'Y'
        },
        d: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'number'
          },
          additionalItems: false
        }
      },
      required: [ 'a', 'b', 'd' ],
      additionalProperties: false
    });
  });

  it('validate a document that matches a schema', () => {
    const validate = schema.validator(schema(objectType('doc', {
      x: number()
    })));

    const doc = {
      x: 1
    };

    const v = validate(doc);
    expect(v).to.equal(doc);
  });

  it('validate a document that does not match a schema', () => {
    const validate = schema.validator(schema(objectType('doc', {
      a: required(string()),
      b: required(time()),
      c: enumType('xy', ['X', 'Y'], 'Y'),
      d: required(arrayOf(number()))
    })));

    const doc = {
      b: 1.23,
      c: 'Z',
      d: [1, 'x'],
      y: 1
    };

    let v;
    let err;
    try {
      v = validate(doc);
    }
    catch(e) {
      err = e;
    }

    expect(v).to.equal(undefined);
    expect(err.message).to.deep.equal(
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
        }
      ]);
  });

  it('converts a schema to a GraphQL schema', () => {
    const graph = schema.graph(objectType('doc', {
      a: required(string()),
      b: required(time()),
      c: enumType('xy', ['X', 'Y'], 'Y'),
      d: required(arrayOf(number()))
    }));

    const obj = new graphql.GraphQLObjectType({
      name: 'doc',
      description: undefined,
      fields: () => ({
        a: {
          type: new graphql.GraphQLNonNull(graphql.GraphQLString)
        },
        b: {
          type: new graphql.GraphQLNonNull(graphql.GraphQLInt)
        },
        c: {
          type: new graphql.GraphQLEnumType({
            name: 'xy',
            description: undefined,
            values: {
              X: {
                value: 'X'
              },
              Y: {
                value: 'Y'
              }
            }
          })
        },
        d: {
          type: new graphql.GraphQLNonNull(
            new graphql.GraphQLList(graphql.GraphQLFloat))
        }
      })
    });

    expect(graph.name).to.equal(obj.name);
    expect(graph.getFields()).to.deep.equal(obj.getFields());
  });
});

