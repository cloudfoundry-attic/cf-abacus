'use strict';

// GraphQL schema definition utilities.

const _ = require('underscore');
const graphql = require('graphql');

const pairs = _.pairs;
const map = _.map;
const object = _.object;

// Convert a data type to a GraphQL schema type
const schema = (t) => {
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
    })
  }[t.type](t);
};

// Export our public functions
module.exports = schema;
module.exports.schema = schema;

