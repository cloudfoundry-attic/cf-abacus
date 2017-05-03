'use strict';

// Data schema definition and validation utilities.

const schema = require('..');
const graphql = require('graphql');

const string = schema.string;
const number = schema.number;
const time = schema.time;
const functionString = schema.functionString;
const arrayOf = schema.arrayOf;
const enumType = schema.enumType;
const objectType = schema.objectType;
const required = schema.required;
const unionType = schema.unionType;
const anyType = schema.anyType;

const _ = require('underscore');
const map = _.map;
const identity = _.identity;

describe('abacus-schema', () => {
  it('converts a schema to a JSON schema', () => {
    const json = schema(objectType('doc', {
      a: required(string()),
      b: required(time()),
      c: enumType('xy', ['X', 'Y'], 'Y'),
      d: required(arrayOf(number())),
      e: arrayOf(number(), 2),
      f: unionType('utest', [
        objectType('test1', { g: string() }),
        objectType('test2', { h: number() })
      ]),
      i: anyType('any'),
      j: functionString()
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
        },
        f: {
          title: 'utest',
          description: undefined,
          anyOf: [{
            title: 'test1',
            type: 'object',
            description: undefined,
            properties: {
              g: {
                type: 'string'
              }
            },
            required: [],
            additionalProperties: false
          }, {
            title: 'test2',
            type: 'object',
            description: undefined,
            properties: {
              h: {
                type: 'number'
              }
            },
            required: [],
            additionalProperties: false
          }]
        },
        i: {
          title: 'any',
          description: undefined,
          anyOf: [
            {
              type: 'string'
            },
            {
              type: 'number'
            },
            {
              type: 'integer',
              format: 'utc-millisec'
            },
            {
              type: 'object'
            },
            {
              type: 'array'
            }
          ]
        },
        j: {
          type: 'string',
          format: 'function'
        }
      },
      required: [ 'a', 'b', 'd' ],
      additionalProperties: false
    });
  });

  it('validates a document that matches a schema', () => {
    const validate = schema.validator(schema(objectType('doc', {
      x: number(),
      y: string(),
      z: anyType(),
      t: anyType(),
      u: anyType(),
      v: functionString()
    })));

    const doc = {
      x: 1,
      y: 'abc',
      z: {
        a: 1
      },
      t: 1,
      u: [1, 2],
      v: (() => 42).toString()
    };

    [true, false].forEach((validateFunctions) => {
      process.env.VALIDATE_FUNCTIONS = validateFunctions;
      const v = validate(doc);
      delete process.env.VALIDATE_FUNCTIONS;
      expect(v).to.equal(doc);
    });
  });

  it('validates a document that does not match a schema', () => {
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
          type: 'object',
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
          type: 'object',
          field: 'data',
          message: 'has additional properties',
          value: 'data.y'
        },
        {
          type: 'integer',
          field: 'data.b',
          message: 'is the wrong type',
          value: 1.23
        },
        {
          type: undefined,
          field: 'data.c',
          message: 'must be an enum value',
          value: 'Z'
        },
        {
          type: 'number',
          field: 'data.d.1',
          message: 'is the wrong type',
          value: 'x'
        },
        {
          type: 'array',
          field: 'data.e',
          message: 'has less items than allowed',
          value: [1]
        }
      ]);
  });

  it('validates a document that contains invalid functions', () => {
    const validate = schema.validator(schema(objectType('doc', {
      a: arrayOf(functionString())
    })));

    const doc = {
      a: [
        '() =>', // syntax error
        '/* eslint no-console: 0 */ () => console.log(42)', // no-console
        'abc', // no-undef
        '(unusedVar) => 42' // no-unused-vars
      ]
    };

    [true, false].forEach((validateFunctions) => {
      let v, err;
      try {
        process.env.VALIDATE_FUNCTIONS = validateFunctions;
        v = validate(doc);
        delete process.env.VALIDATE_FUNCTIONS;
      }
      catch(e) {
        err = e;
      }

      if(validateFunctions) {
        expect(v).to.equal(undefined);
        expect(err.message).to.deep.equal([
          {
            type: 'string',
            field: 'data.a.0',
            message: 'must be function format',
            value: '() =>'
          },
          {
            type: 'string',
            field: 'data.a.1',
            message: 'must be function format',
            value: '/* eslint no-console: 0 */ () => console.log(42)'
          },
          {
            type: 'string',
            field: 'data.a.2',
            message: 'must be function format',
            value: 'abc'
          },
          {
            field: 'data.a.3',
            message: 'must be function format',
            type: 'string',
            value: '(unusedVar) => 42'
          },
          {
            column: 6,
            fatal: true,
            line: 1,
            message: 'Parsing error: Unexpected token',
            ruleId: null,
            severity: 2,
            source: '() =>'
          },
          {
            column: 34,
            endColumn: 45,
            endLine: 1,
            line: 1,
            message: 'Unexpected console statement.',
            nodeType: 'MemberExpression',
            ruleId: 'no-console',
            severity: 2,
            source: '/* eslint no-console: 0 */ () => console.log(42)'
          },
          {
            column: 34,
            line: 1,
            message: '\'console\' is not defined.',
            nodeType: 'Identifier',
            ruleId: 'no-undef',
            severity: 2,
            source: '/* eslint no-console: 0 */ () => console.log(42)'
          },
          {
            column: 1,
            line: 1,
            message: '\'abc\' is not defined.',
            nodeType: 'Identifier',
            ruleId: 'no-undef',
            severity: 2,
            source: 'abc'
          },
          {
            column: 2,
            line: 1,
            message: '\'unusedVar\' is defined but never used.',
            nodeType: 'Identifier',
            ruleId: 'no-unused-vars',
            severity: 2,
            source: '(unusedVar) => 42'
          }
        ]);
      }
      else
        expect(v).to.equal(doc);
    });
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

    const type1 = objectType('type1', { g: required(string()) });
    const type2 = objectType('type2', { h: required(number()) });
    const ugraph = schema.graph(unionType('udoc', [type1, type2], (o) => {
      if(o.g)
        return schema.graph(type1);
      if(o.h)
        return schema.graph(type2);
      return undefined;
    }));

    const utype1 = new graphql.GraphQLObjectType({
      name: 'type1',
      fields: () => ({
        g: new graphql.GraphQLNonNull(graphql.GraphQLString)
      })
    });
    const utype2 = new graphql.GraphQLObjectType({
      name: 'type2',
      fields: () => ({
        h: new graphql.GraphQLNonNull(graphql.GraphQLFloat)
      })
    });
    const uobj = new graphql.GraphQLUnionType({
      name: 'udoc',
      types: [utype1, utype2],
      resolveType: (o) => {
        if(o.g)
          return utype1;
        if(o.h)
          return utype2;
        return undefined;
      }
    });

    expect(ugraph.name).to.equal(uobj.name);
    map(ugraph.getPossibleTypes(), (type) => {
      expect(uobj.isPossibleType(type)).to.equal(true);
    });

    const agraph = schema.graph(anyType('any'));

    const aobj = new graphql.GraphQLScalarType({
      name: 'any',
      description: undefined,
      coerce: identity,
      serialize: identity
    });

    expect(agraph.name).to.equal(aobj.name);
    expect(agraph.coerce).to.equal(aobj.coerce);
  });
});

