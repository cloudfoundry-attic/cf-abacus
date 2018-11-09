'use strict';

const { find } = require('underscore');

const _createFinder = (predicate, createError) => (id, collection) => {
  const element = find(collection, predicate(id));  

  if(!element) 
    throw createError(id);

  return element;
};

const _resourceIdPredicate = (id) => (resource) => resource.resource_id === id; 
const findResourceById = _createFinder(_resourceIdPredicate, (id) => new Error('Missing resource with id %s', id));

const _metricNamePredicate = (name) => (metric) => metric.metric === name;
const findMetricByName = _createFinder(_metricNamePredicate, (id) => new Error('Missing resource with id %s', id));

const _planIdPredicate = (id) => (plan) => plan.plan_id === id;
const findPlanById = _createFinder(_planIdPredicate, (id) => new Error('Missing plan with id %s', id));

const _spaceIdPredicate = (id) => (space) => space.space_id === id;
const findSpaceById = _createFinder(_spaceIdPredicate, (id) => new Error('Missing space with id %s', id));

const _consumerIdPredicate = (id) => (consumer) => consumer.consumer_id === id;
const findConsumerById = _createFinder(_consumerIdPredicate, (id) => new Error('Missing consumer with id %s', id));


module.exports = {
  findResourceById,
  findMetricByName,
  findConsumerById,
  findSpaceById,
  findPlanById
};
