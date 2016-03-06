'use strict';

// GraphQL schema definition utilities.

const _ = require('underscore');
const graphql = require('graphql');

const pairs = _.pairs;
const map = _.map;
const object = _.object;
const memoize = _.memoize;
const identity = _.identity;

// Convert a data type to a GraphQL schema type
const schema = memoize((t) => {
  return {
    string: (t) => graphql.GraphQLString,
    number: (t) => graphql.GraphQLFloat,
    time: (t) => graphql.GraphQLInt,
    arrayOf: (t) => new graphql.GraphQLList(schema(t.items)),
    enumType: (t) => new graphql.GraphQLEnumType({
      name: t.name,
      description: t.description,
      values: object(map(t.enum, (e) => [e, {
        value: e
      }]))
    }),
    objectType: (t) => new graphql.GraphQLObjectType({
      name: t.name,
      description: t.description,
      fields: () => object(map(pairs(t.properties), (p) => [p[0], {
        type: p[1].required ?
          new graphql.GraphQLNonNull(schema(p[1])) : schema(p[1])
      }])),
      args: object(map(pairs(t.args), (p) => [p[0], {
        type: p[1].required ?
          new graphql.GraphQLNonNull(schema(p[1])) : schema(p[1])
      }]))
    }),
    unionType: (t) => new graphql.GraphQLUnionType({
      name: t.name,
      types: map(t.types, (type) => schema(type)),
      resolveType: t.resolveType,
      description: t.description
    }),
    anyType: (t) => new graphql.GraphQLScalarType({
      name: t.name,
      description: t.description,
      coerce: identity,
      serialize: identity
    })
  }[t.type](t);
}, (t) => JSON.stringify(t));

// Export our public functions
module.exports = schema;
module.exports.schema = schema;

