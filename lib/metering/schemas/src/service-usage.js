'use strict';

// Service usage schema

const _ = require('underscore');

const schema = require('cf-abacus-schema');
const usage = require('./usage.js');

const clone = _.clone;
const extend = _.extend;

const string = schema.types.string;
const object = schema.types.object;
const arrayOf = schema.types.arrayOf;

// Service instance schema
const serviceInstance = object({ service_instance_id: string(), usage: arrayOf(usage()) }, ['service_instance_id', 'usage']);

// Export our public functions
module.exports = () => extend(clone(object({ service_instances: arrayOf(serviceInstance) }, ['service_instances'])),
    { title: 'Service Usage', description: 'Usage records for a service' });
