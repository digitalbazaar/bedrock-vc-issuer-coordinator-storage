/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import {createContentId as _createContentId} from './util.js';
import assert from 'assert-plus';
import {LruCache} from '@digitalbazaar/lru-memoize';

const {util: {BedrockError}} = bedrock;

// FIXME: rename to `vc-issuer-coordinator-vc-reference`
// exported to enable business-rule-specific indexes and other capabilities
export const COLLECTION_NAME = 'vc-reference';

// in-memory cache
export let CACHE;
// exported for testing purposes only
export {CACHE as _CACHE};

bedrock.events.on('bedrock.init', async () => {
  _createCache();
});

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  const indexes = [{
    // `credentialId` should be the shard key for sharded databases
    collection: COLLECTION_NAME,
    fields: {'reference.credentialId': 1},
    options: {unique: true, background: false}
  }];

  await database.createIndexes(indexes);
});

/**
 * Creates a content-based identifier from some content (object, string,
 * boolean, etc.). This utility function is useful for applications that want
 * to consistently (re-)generate IDs based on other content fields.
 *
 * @param {object} options - Options to use.
 * @param {*} [options.content] - The content to generate an ID from.
 *
 * @returns {Promise<object>} Resolves to an object with `id`.
 */
export async function createContentId({content} = {}) {
  return _createContentId({content});
}

/**
 * Retrieves a reference record (if it exists).
 *
 * @param {object} options - Options to use.
 * @param {string} [options.credentialId] - The credential ID of the record.
 * @param {boolean} [options.useCache=true] - Whether or not to use the
 *   in-memory cache.
 * @param {boolean} [options.explain=false] - Set to true to return database
 *   query explain information instead of executing database queries.
 *
 * @returns {Promise<object | ExplainObject>} Resolves with the cache entry
 *   database record or an ExplainObject if `explain=true`.
 */
export async function get({
  credentialId, useCache = true, explain = false
} = {}) {
  assert.string(credentialId, 'credentialId');

  // do not use in-memory cache when specified or explaining database query
  if(!useCache || explain) {
    return _getUncachedRecord({credentialId, explain});
  }

  const fn = () => _getUncachedRecord({credentialId});
  return CACHE.memoize({key: credentialId, fn});
}

/**
 * Inserts a VC reference into the database, provided that it is not a
 * duplicate.
 *
 * @param {object} options - Options to use.
 * @param {object} options.reference - The reference to insert; must have
 *   `credentialId` set and `sequence` set to `0`.
 *
 * @returns {Promise<object>} An object with the reference record.
 */
export async function insert({reference} = {}) {
  assert.object(reference, 'reference');
  assert.string(reference.credentialId, 'reference.credentialId');
  assert.number(reference.sequence, 'reference.sequence');
  if(reference.sequence !== 0) {
    throw new BedrockError(
      'Could not insert VC reference record. Initial "sequence" must be "0".', {
        name: 'InvalidStateError',
        details: {
          httpStatusCode: 409,
          public: true
        }
      });
  }

  const now = Date.now();
  const collection = database.collections[COLLECTION_NAME];
  const meta = {created: now, updated: now};
  const record = {
    reference,
    meta
  };

  try {
    await collection.insertOne(record);
    return {reference, meta};
  } catch(cause) {
    if(!database.isDuplicateError(cause)) {
      throw cause;
    }
    throw new BedrockError('Duplicate VC reference record.', {
      name: 'DuplicateError',
      details: {
        public: true,
        httpStatusCode: 409
      },
      cause
    });
  }
}

/**
 * Retrieves all VC reference records matching the given query.
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

  const documents = await collection.find(query, options).toArray();
  return {documents};
}

/**
 * Retrieves a count of all VC reference records matching the given query.
 *
 * @param {object} options - The options to use.
 * @param {object} options.query - The optional query to use (default: {}).
 * @param {object} [options.options={}] - Query options (eg: 'sort', 'limit').
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<Array | ExplainObject>} Resolves with the records that
 *   matched the query or returns an ExplainObject if `explain=true`.
 */
export async function count({query = {}, options = {}, explain = false} = {}) {
  const collection = database.collections[COLLECTION_NAME];

  if(explain) {
    // 'find()' is used here because 'countDocuments()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query, options);
    return cursor.explain('executionStats');
  }

  return collection.countDocuments(query, options);
}

/**
 * Updates (replaces) a VC reference if the reference's `sequence` is one
 * greater than the existing record.
 *
 * @param {object} options - The options to use.
 * @param {object} options.reference - The new VC reference with `credentialId`
 *   and `sequence` minimally set.
 * @param {boolean} [options.explain=false] - An optional explain boolean.
 *
 * @returns {Promise<boolean | ExplainObject>} Resolves with `true` on update
 *   success or an ExplainObject if `explain=true`.
 */
export async function update({reference, explain = false} = {}) {
  assert.object(reference, 'reference');
  assert.string(reference.credentialId, 'reference.credentialId');
  assert.number(reference.sequence, 'reference.sequence');

  // build update
  const now = Date.now();
  const update = {};
  update.$set = {reference, 'meta.updated': now};

  const collection = database.collections[COLLECTION_NAME];
  const query = {
    'reference.credentialId': reference.credentialId,
    'reference.sequence': reference.sequence - 1
  };

  if(explain) {
    // 'find().limit(1)' is used here because 'updateOne()' doesn't return a
    // cursor which allows the use of the explain function.
    const cursor = await collection.find(query).limit(1);
    return cursor.explain('executionStats');
  }

  const result = await collection.updateOne(query, update);
  if(result.result.n > 0) {
    // document modified: success;
    // clear any in-memory cache entry
    CACHE.delete(reference.credentialId);
    return true;
  }

  throw new BedrockError(
    'Could not update VC reference. Sequence does not match existing record.', {
      name: 'InvalidStateError',
      details: {
        httpStatusCode: 409,
        public: true,
        expected: reference.sequence - 1
      }
    });
}

function _createCache() {
  const cfg = bedrock.config['vc-issuer-coordinator-storage'];
  const options = {
    ...cfg.caches.vcReference
  };
  CACHE = new LruCache(options);
}

async function _getUncachedRecord({credentialId, explain = false} = {}) {
  const query = {'reference.credentialId': credentialId};
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
    throw new BedrockError('VC reference record not found.', {
      name: 'NotFoundError',
      details
    });
  }
  return record;
}

/**
 * An object containing information on the query plan.
 *
 * @typedef {object} ExplainObject
 */
