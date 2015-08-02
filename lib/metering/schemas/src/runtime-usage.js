'use strict';

// Runtime usage schema

const _ = require('underscore');

const types = require('./types.js');
const usage = require('./usage.js');

const clone = _.clone;
const extend = _.extend;

const object = types.object;
const arrayOf = types.arrayOf;

// Export our public functions
module.exports = () => extend(clone(object({ usage: arrayOf(usage()) }, ['usage'])),
    { title: 'Runtime Usage', description: 'Usage records for a runtime' });
