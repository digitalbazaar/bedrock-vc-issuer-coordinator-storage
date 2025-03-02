/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import {
  createTaskId, decryptTaskSecrets, encryptTaskSecrets
} from './taskEncryption.js';
import assert from 'assert-plus';

const {util: {BedrockError}} = bedrock;

export const COLLECTION_NAME = 'vc-issuer-coordinator-task';

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  const indexes = [{
    collection: COLLECTION_NAME,
    fields: {'task.id': 1},
    options: {unique: true, background: false}
  }, {
    collection: COLLECTION_NAME,
    fields: {'meta.created': 1},
    options: {unique: false, background: false}
  }, {
    // sparse expiration index
    collection: COLLECTION_NAME,
    fields: {'task.expires': 1},
    options: {
      // only some tasks expire/tasks may add `expires` after creation
      partialFilterExpression: {'task.expires': {$exists: true}},
      unique: false,
      background: false,
      // grace period of 24 hours
      expireAfterSeconds: 60 * 60 * 24
    }
  }];

  await database.createIndexes(indexes);
});

/**
 * Creates a task record for the given request, provided that the request is
 * not a duplicate.
 *
 * @param {object} options - Options to use.
 * @param {object} options.request - The request to insert.
 * @param {Date} [options.expires] - An optional expiration date for the record.
 *
 * @returns {Promise<object>} An object with the reference record.
 */
export async function create({request, expires} = {}) {
  assert.object(request, 'request');
  assert.optionalDate(expires, 'expires');

  // create `task` for record
  const {id} = await createTaskId({request});
  let task = {
    id, sequence: 0, request
  };
  if(expires) {
    task.expires = expires;
  }
  // encrypt any secrets in `task` according to configuration
  task = await encryptTaskSecrets({task});

  const now = Date.now();
  const collection = database.collections[COLLECTION_NAME];
  const meta = {created: now, updated: now};
  const record = {task, meta};

  try {
    await collection.insertOne(record);
    return {task, meta};
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    throw new BedrockError('Duplicate issuer coordinator task record.', {
      name: 'DuplicateError',
      details: {
        public: true,
        httpStatusCode: 409
      },
      cause: e
    });
  }
}

/**
 * Retrieves all task records matching the given query.
 *
 * Supported indexes include searching by `meta.created` or `task.expires`.
 *
 * @param {object} options - The options to use.
 * @param {object} options.query - The optional query to use (default: {}).
 * @param {object} [options.options={}] - Query options (eg: 'sort', 'limit').
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<Array | ExplainObject>} Resolves with the records that
 *   matched the query or returns an ExplainObject if `explain=true`.
 */
export async function find({query = {}, options = {}, explain = false} = {}) {
  const collection = database.collections[COLLECTION_NAME];

  if(explain) {
    const cursor = await collection.find(query, options);
    return cursor.explain('executionStats');
  }

  const records = await collection.find(query, options).toArray();
  // decrypt task secrets in every record
  return Promise.all(records.map(async record => {
    record.task = await decryptTaskSecrets({task: record.task});
    return record;
  }));
}

/**
 * Retrieves a task record (if it exists) by its `id` or by its `request`.
 *
 * @param {object} options - Options to use.
 * @param {string} [options.id] - The ID of the record.
 * @param {object} [options.request] - The request of the record.
 * @param {boolean} [options.explain=false] - Set to true to return database
 *   query explain information instead of executing database queries.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the sync
 *   database record or an ExplainObject if `explain=true`.
 */
export async function get({id, request, explain = false} = {}) {
  assert.optionalString(id, 'id');
  assert.optionalObject(request, 'request');
  if(!(id || request) || (id && request)) {
    throw new TypeError('One and only one of "id" or "request" must be given.');
  }

  if(request) {
    ({id} = await createTaskId({request}));
  }

  const query = {'task.id': id};
  const collection = database.collections[COLLECTION_NAME];
  const projection = {_id: 0};

  if(explain) {
    // 'find().limit(1)' is used here because 'findOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query, {projection}).limit(1);
    return cursor.explain('executionStats');
  }

  const record = await collection.findOne(query, {projection});
  if(!record) {
    const details = {
      httpStatusCode: 404,
      public: true
    };
    throw new BedrockError(
      'Issuer coordinator task record not found.', {
        name: 'NotFoundError',
        details
      });
  }

  // decrypt task secrets and return record
  record.task = await decryptTaskSecrets({task: record.task});
  return record;
}

/**
 * Updates (replaces) a task record if the record's `sequence` is one greater
 * than the existing record.
 *
 * @param {object} options - The options to use.
 * @param {object} options.task - The new task data with `id`
 *   and `sequence` minimally set.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on update
 *   success or an ExplainObject if `explain=true`.
 */
export async function update({task, explain = false} = {}) {
  // encrypt any task secrets according to configuration
  task = await encryptTaskSecrets({task});

  // build update
  const now = Date.now();
  const update = {};
  update.$set = {task, 'meta.updated': now};

  const collection = database.collections[COLLECTION_NAME];
  const query = {
    'task.id': task.id,
    'task.sequence': task.sequence - 1
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
    'Could not update issuer coordinator task record. ' +
    'Sequence does not match existing record.', {
      name: 'InvalidStateError',
      details: {
        httpStatusCode: 409,
        public: true,
        expected: task.sequence - 1
      }
    });
}

/**
 * Deletes a task record (if it exists).
 *
 * @param {object} options - Options to use.
 * @param {string} [options.id] - The ID of the record.
 * @param {object} [options.request] - The request of the record.
 *
 * @returns {Promise} Resolves once the deletion completes.
 */
export async function remove({id, request} = {}) {
  assert.optionalString(id, 'id');
  assert.optionalObject(request, 'request');
  if(!(id || request) || (id && request)) {
    throw new TypeError('One and only one of "id" or "request" must be given.');
  }

  if(request) {
    ({id} = await createTaskId({request}));
  }

  const query = {'task.id': id};
  const collection = database.collections[COLLECTION_NAME];

  await collection.removeOne(query);
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */
