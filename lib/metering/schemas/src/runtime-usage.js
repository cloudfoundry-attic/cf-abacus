'use strict';

// Runtime usage schema

const _ = require('underscore');

const schema = require('abacus-schema');
const usage = require('./usage.js');

const clone = _.clone;
const extend = _.extend;

const object = schema.types.object;
const arrayOf = schema.types.arrayOf;

// Export our public functions
module.exports = () => extend(clone(object({ usage: arrayOf(usage()) }, ['usage'])),
    { title: 'Runtime Usage', description: 'Usage records for a runtime' });
