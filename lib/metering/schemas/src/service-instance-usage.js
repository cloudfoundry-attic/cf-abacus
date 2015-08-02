'use strict';

// Service instance usage schema

const _ = require('underscore');

const types = require('./types.js');
const usage = require('./usage.js');

const clone = _.clone;
const extend = _.extend;

const string = types.string;
const object = types.object;
const arrayOf = types.arrayOf;

// Export our public functions
module.exports = () => extend(clone(object({ service_id: string(), usage: arrayOf(usage()) }, ['service_id', 'usage'])),
    { title: 'Service Instance Usage', description: 'Usage records for a service instance' });
