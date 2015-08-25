'use strict';

// GraphQL schema definition utilities.

const _ = require('underscore');
const _g = require('graphql');

const pairs = _.pairs;
const map = _.map;
const object = _.object;

// const graphql = _g.graphql;

// const debug = require('abacus-debug')('abacus-schema');

// Convert a data type to a GraphQL schema type
const schema = (t) => {
  return {
    string: (t) => _g.GraphQLString,
    number: (t) => _g.GraphQLFloat,
    time: (t) => _g.GraphQLInt,
    arrayOf: (t) => new _g.GraphQLList(schema(t.items)),
    enumType: (t) => new _g.GraphQLEnumType({
      name: t.name,
      description: t.description,
      values: object(map(t.enum, (e) => [e, {
        value: e
      }]))
    }),
    objectType: (t) => new _g.GraphQLObjectType({
      name: t.name,
      description: t.description,
      fields: () => object(map(pairs(t.properties), (p) => [p[0], {
        type: p[1].required ?
          new _g.GraphQLNonNull(schema(p[1])) : schema(p[1])
      }])),
      args: object(map(pairs(t.args), (p) => [p[0], {
        type: p[1].required ?
          new _g.GraphQLNonNull(schema(p[1])) : schema(p[1])
      }]))
    })
  }[t.type](t);
};

// Export our public functions
module.exports = schema;
module.exports.schema = schema;

