'use strict';

const moment = require('abacus-moment');

const MONGO_DUPLICATE_KEY_ERROR_CODE = 11000;

class SpanDAO {
  constructor(collection) {
    this.collection = collection;
  }

  async startSpan(timestamp, target, measures, dedupID = undefined) {
    const span = {
      target: target,
      measured_usage: measures,
      start: timestamp,
      end: null,
      processing: {
        complete: false,
        last_interval: {
          start: timestamp,
          end: timestamp
        },
        planned_interval: null,
        last_change_at: moment.now(),
        version: 1
      }
    };
    if (dedupID)
      span.start_dedup_id = dedupID;
    try {
      await this.collection.insertOne(span);
      return true;
    } catch (e) {
      if (e.code !== MONGO_DUPLICATE_KEY_ERROR_CODE)
        throw e;
      return false;
    }
  }

  async endSpan(timestamp, target, newCorrelationID, dedupID = undefined) {
    const filter = {
      'target': target,
      'end': null
    };
    const update = {
      '$set': {
        'target.correlation_id': newCorrelationID,
        'end': timestamp
      }
    };
    if (dedupID)
      update.$set.end_dedup_id = dedupID;
    const options = {};
    try {
      const status = await this.collection.findOneAndUpdate(filter, update, options);
      return !!status.value;
    } catch (e) {
      if (e.code !== MONGO_DUPLICATE_KEY_ERROR_CODE)
        throw e;
      return false;
    }
  }

  async deleteSpansByIDs(ids) {
    await this.collection.deleteMany({
      '_id': {
        '$in': ids
      }
    });
  }

  async getSpanByTarget(target) {
    const cursor = this.collection.find({
      'target': target
    }).limit(1);
    if (!await cursor.hasNext())
      return undefined;
    return await cursor.next();
  }

  async existsSpanWithStartDedupID(id) {
    if (!id)
      return false;
    const cursor = this.collection.find({
      'start_dedup_id': id
    }).limit(1);
    return await cursor.hasNext();
  }

  async existsSpanWithEndDedupID(id) {
    if (!id)
      return false;
    const cursor = this.collection.find({
      'end_dedup_id': id
    }).limit(1);
    return await cursor.hasNext();
  }

  async updateSpanPlannedInterval(id, interval, version) {
    const filter = {
      '_id': id,
      'processing.version': version
    };
    const update = {
      '$set': {
        'processing.planned_interval': interval,
        'processing.last_change_at': moment.now(),
        'processing.version': version + 1
      }
    };
    const options = {};
    const status = await this.collection.findOneAndUpdate(filter, update, options);
    return !!status.value;
  }

  async updateSpanProcessedInterval(id, interval, complete, version) {
    const filter = {
      '_id': id,
      'processing.version': version
    };
    const update = {
      '$set': {
        'processing.complete': complete,
        'processing.last_interval': interval,
        'processing.planned_interval': null,
        'processing.last_change_at': moment.now(),
        'processing.version': version + 1
      }
    };
    const options = {};
    const status = await this.collection.findOneAndUpdate(filter, update, options);
    return !!status.value;
  }

  async findIncompleteSpans(before, offset, limit) {
    const cursor = this.collection.find({
      'processing.complete': false,
      'processing.last_interval.end': {
        '$lt': before
      }
    }).skip(offset).limit(limit);
    return await cursor.toArray();
  }

  async findCompleteSpans(before, offset, limit) {
    const cursor = this.collection.find({
      'processing.complete': true,
      'processing.last_interval.end': {
        '$lt': before
      }
    }).skip(offset).limit(limit);
    return await cursor.toArray();
  }
}

// NOTE: Changing index definition in the DAO will result in failure
// for existing deployments, changing options will be ignored.
// Should that ever become necessary, either some type of update logic
// needs to be implemented here, or an external provisioning step needs to perform it.

const createTargetIndex = async (collection) => {
  const definition = {
    'target.organization_id': 1,
    'target.space_id': 1,
    'target.consumer_id': 1,
    'target.resource_id': 1,
    'target.plan_id': 1,
    'target.resource_instance_id': 1,
    'target.correlation_id': 1
  };
  const options = {
    name: 'unique_target',
    unique: true
  };
  await collection.createIndex(definition, options);
};

const createStartDedupIndex = async (collection) => {
  const definition = {
    'start_dedup_id': 1
  };
  const options = {
    name: 'unique_start_dedup_id',
    unique: true,
    sparse: true // important, to allow multiple documents with missing dedup field
  };
  await collection.createIndex(definition, options);
};

const createEndDedupIndex = async (collection) => {
  const definition = {
    'end_dedup_id': 1
  };
  const options = {
    name: 'unique_end_dedup_id',
    unique: true,
    sparse: true // important, to allow multiple documents with missing dedupe field
  };
  await collection.createIndex(definition, options);
};

const createProcessingIndex = async (collection) => {
  const definition = {
    'processing.complete': 1,
    'processing.last_interval.end': 1
  };
  const options = {
    name: 'search_processing'
  };
  await collection.createIndex(definition, options);
};

const createSpanDAO = async (db, collectionName) => {
  const collection = await db.createCollection(collectionName);
  await createTargetIndex(collection);
  await createStartDedupIndex(collection);
  await createEndDedupIndex(collection);
  await createProcessingIndex(collection);
  return new SpanDAO(collection);
};

module.exports = {
  createSpanDAO
};
