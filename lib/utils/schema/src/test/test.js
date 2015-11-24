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
      d: required(arrayOf(number())),
      e: arrayOf(number(), 2)
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
          minItems: 0,
          items: {
            type: 'number'
          },
          additionalItems: false
        },
        e: {
          type: 'array',
          minItems: 2,
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
      d: required(arrayOf(number())),
      e: arrayOf(number(), 2)
    })));

    const doc = {
      b: 1.23,
      c: 'Z',
      d: [1, 'x'],
      e: [1],
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
            e: [1],
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
        },
        {
          field: 'data.e',
          message: 'has less items than allowed',
          value: [1]
        }
      ]);
  });

  it('converts a schema to a GraphQL schema', () => {
    const graph = schema.graph(objectType('doc', {
      a: required(string()),
      b: required(time()),
      c: enumType('xy', ['X', 'Y'], 'Y'),
      d: required(arrayOf(number())),
      e: arrayOf(number(), 2)
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
        },
        e: {
          type: new graphql.GraphQLList(graphql.GraphQLFloat)
        }
      })
    });

    expect(graph.name).to.equal(obj.name);
    expect(graph.getFields()).to.deep.equal(obj.getFields());
  });
});

