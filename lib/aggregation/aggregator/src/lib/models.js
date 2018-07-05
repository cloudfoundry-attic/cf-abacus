'use strict';

const moment = require('abacus-moment');
const { each, extend, filter, rest, object } = require('underscore');

const edebug = require('abacus-debug')('e-abacus-usage-aggregator-models');

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () =>
  /^[0-9]+[MDhms]$/.test(process.env.SLACK)
    ? {
      scale: process.env.SLACK.charAt(process.env.SLACK.length - 1),
      width: process.env.SLACK.match(/[0-9]+/)[0]
    }
    : {
      scale: 'm',
      width: 10
    };

// Time dimension keys corresponding to their respective window positions
const dimensionsMap = {
  s: 'seconds',
  m: 'minutes',
  h: 'hours',
  D: 'days',
  M: 'months'
};

// Checks if a consumer usage should be pruned from the aggregated usage
// based upon whether the current time exceeds 2 months + slack
const shouldNotPrune = (time) => {
  const t = parseInt(time);
  const d = moment.utc(t);
  d.add(2, 'months');
  d.add(slack().width, dimensionsMap[slack().scale]);
  return d.valueOf() > moment.now();
};

// Find an element with the specified id in a list, and lazily construct and
// add a new one if no element is found
const lazyCons = (l, prop, id, cons) => {
  const f = filter(l, (e) => e[prop] === id);
  if (f.length) return f[0];
  const e = new cons(id);
  l.push(e);
  return e;
};

// Define the objects used to represent a hiearchy of aggregated usage inside
// an organization

// Represent an org, aggregated resource usage and the spaces it contains
const Org = function(id) {
  extend(this, {
    organization_id: id,
    resources: [],
    spaces: []
  });
};
const newOrg = function(id) {
  return new Org(id);
};
Org.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Org.Resource);
};
Org.prototype.space = function(id, doctime) {
  const space = lazyCons(this.spaces, 'space_id', id, Org.Space);
  space.t = doctime;
};

Org.Space = function(id) {
  extend(this, {
    space_id: id
  });
};

const Space = function(id) {
  extend(this, {
    space_id: id,
    consumers: [],
    resources: []
  });
};
const newSpace = function(id) {
  return new Space(id);
};

Space.prototype.consumer = function(id, doctime) {
  // Construct or retrieve the consumer object
  if (!this.consumers) {
    edebug('Missing consumers for space_id: ', this.space_id);
    this.consumers = [];
  }


  const consumer = lazyCons(this.consumers, 'id', id, Space.Consumer);
  consumer.t = doctime;
  this.consumers = filter(this.consumers, (c) => shouldNotPrune(c.t.match(/(\d+)/)[0]));
};

// Represent a consumer reference
// id represents consumer_id
// t represents time component of the consumer aggregated doc id.
Space.Consumer = function(id) {
  extend(this, {
    id: id
  });
};

Space.Resource = function(id) {
  extend(this, {
    resource_id: id,
    plans: []
  });
};

Space.prototype.resource = function(id) {
  if (!this.resources) {
    edebug('Missing resources for space_id: ', this.space_id);
    this.resources = [];
  }
  return lazyCons(this.resources, 'resource_id', id, Space.Resource);
};

Space.Plan = function(id) {
  extend(
    this,
    {
      plan_id: id,
      aggregated_usage: []
    },
    object(['metering_plan_id', 'rating_plan_id', 'pricing_plan_id'], rest(id.split('/')))
  );
};

Space.Resource.prototype.plan = function(id) {
  return lazyCons(this.plans, 'plan_id', id, Space.Plan);
};

Space.Plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a resource instance reference
Space.ResourceInstance = function(rid) {
  extend(this, {
    id: rid
  });
};

// Represent a consumer and aggregated resource usage
const Consumer = function(id) {
  extend(this, {
    consumer_id: id,
    resources: []
  });
};
const newConsumer = function(id) {
  return new Consumer(id);
};

// Represent a resource and its aggregated metric usage
Org.Resource = function(id) {
  extend(this, {
    resource_id: id,
    plans: []
  });
};
Org.Resource.prototype.plan = function(id) {
  return lazyCons(this.plans, 'plan_id', id, Org.Plan);
};

// Represent a plan and its aggregated metric usage
Org.Plan = function(id) {
  extend(
    this,
    {
      plan_id: id,
      aggregated_usage: []
    },
    object(['metering_plan_id', 'rating_plan_id', 'pricing_plan_id'], rest(id.split('/')))
  );
};
Org.Plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a metric based aggregation windows
Org.Metric = function(metric) {
  extend(this, {
    metric: metric,
    windows: [[null], [null], [null], [null], [null]]
  });
};

Consumer.Resource = function(id) {
  extend(this, {
    resource_id: id,
    plans: []
  });
};

Consumer.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Consumer.Resource);
};

Consumer.Plan = function(id) {
  extend(
    this,
    {
      plan_id: id,
      aggregated_usage: [],
      resource_instances: []
    },
    object(['metering_plan_id', 'rating_plan_id', 'pricing_plan_id'], rest(id.split('/')))
  );
};

Consumer.Resource.prototype.plan = function(id) {
  return lazyCons(this.plans, 'plan_id', id, Consumer.Plan);
};

Consumer.Plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a resource instance reference
Consumer.ResourceInstance = function(rid) {
  extend(this, {
    id: rid
  });
};

Consumer.Plan.prototype.resource_instance = function(rid, time, processed) {
  const instance = lazyCons(this.resource_instances, 'id', rid, Consumer.ResourceInstance);
  instance.t = time;
  instance.p = processed;
  this.resource_instances = filter(this.resource_instances, (ri) => shouldNotPrune(ri.p));
  return instance;
};

// Revive an org object
const reviveOrg = (org) => {
  org.resource = Org.prototype.resource;
  org.space = Org.prototype.space;
  each(org.resources, (s) => {
    s.plan = Org.Resource.prototype.plan;
    each(s.plans, (s) => {
      s.metric = Org.Plan.prototype.metric;
    });
  });
  each(org.spaces, (s) => {
    s.consumer = Org.Space.prototype.consumer;
  });
  return org;
};

// Revive a consumer object
const reviveCon = (con) => {
  con.resource = Consumer.prototype.resource;
  each(con.resources, (r) => {
    r.plan = Consumer.Resource.prototype.plan;
    each(r.plans, (p) => {
      p.metric = Consumer.Plan.prototype.metric;
      p.resource_instance = Consumer.Plan.prototype.resource_instance;
    });
  });
  return con;
};

// Revive a space object
const reviveSpace = (space) => {
  space.resource = Space.prototype.resource;
  space.consumer = Space.prototype.consumer;
  each(space.resources, (r) => {
    r.plan = Space.Resource.prototype.plan;
    each(r.plans, (p) => {
      p.metric = Space.Plan.prototype.metric;
      p.resource_instance = Space.Plan.prototype.resource_instance;
    });
  });
  return space;
};

module.exports.reviveOrg = reviveOrg;
module.exports.reviveSpace = reviveSpace;
module.exports.reviveCon = reviveCon;
module.exports.newOrg = newOrg;
module.exports.newSpace = newSpace;
module.exports.newConsumer = newConsumer;
