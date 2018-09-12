'use strict';

const uuid = require('uuid');

const createRandomTarget = () => ({
  organization_id: uuid.v4(),
  space_id: uuid.v4(),
  consumer_id: uuid.v4(),
  resource_id: uuid.v4(),
  plan_id: uuid.v4(),
  resource_instance_id: uuid.v4(),
  correlation_id: uuid.v4()
});

// spanPageObject creates a page object that executes span commands
// for a specific span target, allowing for validation reuse
const spanPageObject = (dao, target) => {

  const startSpan = (timestamp, measures, dedupID = undefined) => {
    const result = async () => {
      return await dao.startSpan(timestamp, target, measures, dedupID);
    };
    const verify = async () => {
      const success = await result();
      expect(success).to.equal(true);
    };
    return { result, verify };
  };

  const endSpan = (timestamp, newCorrelationID, dedupID = undefined) => {
    const result = async () => {
      return await dao.endSpan(timestamp, target, newCorrelationID, dedupID);
    };
    const verify = async () => {
      const success = await result();
      expect(success).to.equal(true);
    };
    return { result, verify };
  };

  const getSpan = () => {
    const result = async () => {
      return await dao.getSpanByTarget(target);
    };
    const verify = async () => {
      const span = await result();
      expect(span).not.to.equal(undefined);
      return span;
    };
    return { result, verify };
  };

  const updateSpanPlannedInterval = (interval, version) => {
    const result = async () => {
      const span = await getSpan().verify();
      return await dao.updateSpanPlannedInterval(span._id, interval, version);
    };
    const verify = async () => {
      const success = await result();
      expect(success).to.equal(true);
    };
    return { result, verify };
  };

  const updateSpanProcessedInterval = (interval, complete, version) => {
    const result = async () => {
      const span = await getSpan().verify();
      return await dao.updateSpanProcessedInterval(span._id, interval, complete, version);
    };
    const verify = async () => {
      const success = await result();
      expect(success).to.equal(true);
    };
    return { result, verify };
  };

  return {
    startSpan,
    endSpan,
    getSpan,
    updateSpanPlannedInterval,
    updateSpanProcessedInterval
  };
};

module.exports = {
  createRandomTarget,
  spanPageObject
};
