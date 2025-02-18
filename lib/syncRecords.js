/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';

const {util: {BedrockError}} = bedrock;

export const COLLECTION_NAME = 'vc-reference-sync';
export const STATUS_SYNC_RECORD_ID = 'STATUS_SYNC_RECORD';

const SYNC_RECORD_IDS = new Set([STATUS_SYNC_RECORD_ID]);

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
 * Retrieves an external storage sync record (if it exists).
 *
 * @param {object} options - Options to use.
 * @param {string} [options.id] - The ID of the record.
 * @param {boolean} [options.explain=false] - Set to true to return database
 *   query explain information instead of executing database queries.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the sync
 *   database record or an ExplainObject if `explain=true`.
 */
export async function get({id, explain = false} = {}) {
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
      // if sync record is not initialized, initialize it
      if(SYNC_RECORD_IDS.has(id)) {
        await _initializeSyncRecords();
        continue;
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

// note: currently only one sync record -- which is for syncing status
async function _initializeSyncRecords() {
  // initialize status sync record
  try {
    const collection = database.collections[COLLECTION_NAME];
    const now = Date.now();
    const record = {
      meta: {created: now, updated: now},
      sync: {
        id: STATUS_SYNC_RECORD_ID,
        sequence: 0
      }
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
    // ignore duplicate error
  }
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */
