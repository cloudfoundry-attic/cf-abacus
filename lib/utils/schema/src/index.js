'use strict';

// Data schema definition and validation utilities.

const types = require('./types.js');
const json = require('./json.js');
const graph = require('./graph.js');
const graphql = require('graphql');

// Export our public functions
module.exports = json;
module.exports.json = json;
module.exports.validator = json.validator;
module.exports.graph = graph;
module.exports.graphql = graphql;
module.exports.string = types.string;
module.exports.number = types.number;
module.exports.time = types.time;
module.exports.enumType = types.enumType;
module.exports.objectType = types.objectType;
module.exports.arrayOf = types.arrayOf;
module.exports.required = types.required;
module.exports.unionType = types.unionType;
module.exports.anyType = types.anyType;

