/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import assert from 'assert-plus';

const {util: {BedrockError}} = bedrock;

export const COLLECTION_NAME = 'vc-reference-sync';

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  const indexes = [{
    collection: COLLECTION_NAME,
    fields: {'sync.id': 1},
    options: {unique: true, background: false}
  }];

  await database.createIndexes(indexes);
});

/**
 * Creates an external storage sync record if it doesn't already exist.
 *
 * @param {object} options - Options to use.
 * @param {string} [options.id] - The ID of the record.
 *
 * @returns {Promise<object>} Resolves with the sync database record.
 */
export async function create({id} = {}) {
  return _lazyCreate({id});
}

/**
 * Retrieves an external storage sync record (if it exists).
 *
 * @param {object} options - Options to use.
 * @param {string} [options.id] - The ID of the record.
 * @param {boolean} [options.create=false] - Set to true to create
 *   the record if it doesn't already exist.
 * @param {boolean} [options.explain=false] - Set to true to return database
 *   query explain information instead of executing database queries.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the sync
 *   database record or an ExplainObject if `explain=true`.
 */
export async function get({id, explain = false, create = false} = {}) {
  assert.string(id, 'id');

  const query = {'sync.id': id};
  const collection = database.collections[COLLECTION_NAME];
  const projection = {_id: 0};

  if(explain) {
    // 'find().limit(1)' is used here because 'findOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query, {projection}).limit(1);
    return cursor.explain('executionStats');
  }

  while(true) {
    const record = await collection.findOne(query, {projection});
    if(!record) {
      if(create) {
        return _lazyCreate({id});
      }
      const details = {
        httpStatusCode: 404,
        public: true
      };
      throw new BedrockError(
        'External storage sync record not found.', {
          name: 'NotFoundError',
          details
        });
    }
    return record;
  }
}

/**
 * Updates (replaces) an external storage sync record if the record's
 * `sequence` is one greater than the existing record.
 *
 * @param {object} options - The options to use.
 * @param {object} options.sync - The new sync data with `id`
 *   and `sequence` minimally set.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on update
 *   success or an ExplainObject if `explain=true`.
 */
export async function update({sync, explain = false} = {}) {
  assert.object(sync, 'sync');
  assert.string(sync.id, 'sync.id');
  assert.number(sync.sequence, 'sync.sequence');

  // build update
  const now = Date.now();
  const update = {};
  update.$set = {sync, 'meta.updated': now};

  const collection = database.collections[COLLECTION_NAME];
  const query = {
    'sync.id': sync.id,
    'sync.sequence': sync.sequence - 1
  };

  if(explain) {
    // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  const result = await collection.updateOne(query, update);
  if(result.result.n > 0) {
    // document modified: success
    return true;
  }

  throw new BedrockError(
    'Could not update external storage sync record. ' +
    'Sequence does not match existing record.', {
      name: 'InvalidStateError',
      details: {
        httpStatusCode: 409,
        public: true,
        expected: sync.sequence - 1
      }
    });
}

async function _lazyCreate({id} = {}) {
  // initialize status sync record
  try {
    const collection = database.collections[COLLECTION_NAME];
    const now = Date.now();
    const record = {
      meta: {created: now, updated: now},
      sync: {id, sequence: 0}
    };

    await collection.insertOne(record);
    return record;
  } catch(cause) {
    if(!database.isDuplicateError(cause)) {
      throw new BedrockError(
        'Could not initialize external storage sync record.', {
          name: 'OperationError',
          details: {
            public: true,
            httpStatusCode: 500
          },
          cause
        });
    }
    // ignore duplicate error and return record
    return get({id});
  }
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */
