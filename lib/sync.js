/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as syncRecords from './syncRecords.js';
import * as vcReferences from './vcReferences.js';
import assert from 'assert-plus';
import {expandCredentialStatus} from './utils.js';
import {logger} from './logger.js';
import PQueue from 'p-queue';
import {zcapClient} from './zcapClient.js';

const {util: {BedrockError}} = bedrock;
const ROOT_ZCAP_PREFIX = 'urn:zcap:root:';

/**
 * Synchronizes status tracked by both a remote VC API status instance and
 * what is stored locally here in this VC issuer coordinator's database against
 * a set updates provided by the caller. The caller is responsible for
 * providing a unique sync identifier, `syncId`, and a function,
 * `getStatusUpdates()` that will return a set of related status updates that
 * is chunked/paged based on a provided `cursor`. The function then returns
 * the chunk/page of updates to be applied and the next `cursor` that can be
 * used to ask for more updates (or that indicates that no more updates are
 * presently available).
 *
 * An undefined `cursor` will be supplied by the caller of `getStatusUpdates()`
 * the first time this function is called. The returned cursor is an object
 * with at least the property `hasMore: <boolean>` that indicates whether
 * additional calls can currently be made to get more updates. Note that
 * whether more status updates might be available in the future (even though
 * they are unavailable now) is not necessarily indicated by this flag.
 *
 * Once the statuses updates are applied, the returned `cursor` object will be
 * stored locally to be used in a subsequent call.
 *
 * A simplistic example `getStatusUpdates({cursor, limit})` function would
 * perform a lookup on some database using the cursor and limit information
 * (this could be an external database or potentially even the `vc-reference`
 * database for some kind of internally status processing algorithm). Example
 * cursor information could refer to the last update datetime that was
 * checked against an external database. The function would return update
 * objects matching any found updates and a cursor object with the new last
 * update datetime.
 *
 * Note that the current implementation assumes that if the remote and local
 * status tracking systems are synchronized with multiple external state
 * tracking systems that the caller will ensure they are appropriately
 * synchronized with one another, i.e., if there is more than one external
 * system, then the implementer of `getStatusUpdates()` must handle that
 * complexity.
 *
 * IMPORTANT NOTE ON DATA PARTITIONING: An issuer coordinator must write
 * `vcReference` records prior to VCs being issued in order to support
 * duplicate checking and status updates -- as the issuance system and status
 * systems are partitioned from it. It is important to note that this means
 * that some sync views may, for example, revoke all VCs that have actually
 * been issued because the only remaining `vcReference` records do not have any
 * actually issued VCs associated with them. If this is undesirable, the sync
 * view must engineer around it or be scheduled such that it will not occur.
 *
 * Additionally, some implementations may opt to leave behind "dangling"
 * `vcReference` records for VCs that are never issued (due to arbitrary
 * failures, e.g., a digital wallet holder never picks up the VC) that sync
 * views encounter during status syncing (the alternative is to ensure that a
 * sync view only runs after a garbage collector removes these or to otherwise
 * cause the sync view to not see them). For those implementations that allow
 * sync views to safely encounter these records, the
 * `options.ignoreCredentialNotFound=true` flag can be passed. This will cause
 * any `NotFoundError` error received when contacting the status service to be
 * ignored and any `vcReference` update to still be applied to the record. It
 * is important to note that this means that some sync views may, for example,
 * revoke all VCs that have actually been issued because the only remaining
 * `vcReference` records do not have any actually issued VCs associated with
 * them.
 *
 * @param {object} options - Options to use.
 * @param {string} options.syncId - A unique ID for the external system to
 *   sync with; used to internally track sychronization progress with that
 *   system over multiple sync calls.
 * @param {Function} options.getStatusUpdates - The function to call to get
 *   updates from an external status tracking system that need to be applied to
 *   both a remote status instance and local storage.
 * @param {object} [options.options] - The synchronization options to use:
 *   {number} [options.options.concurrency=4] - The maximum number of
 *     status updates to run concurrently.
 *   {object} [options.options.signal] - An `AbortController` signal
 *     that can be used to attempt to abort the status update process.
 *   {number} [options.options.limit=100] - The maximum number of status
 *     updates to run.
 *   {boolean} [options.options.ignoreCredentialNotFound=false] - Set to `true`
 *     to ignore a credential `NotFoundError` error when attempting to update a
 *     verifiable credential's status at the associated status service, but
 *     still apply the `vcReference` record update; by default these errors
 *     will cause the sync to halt.
 *
 * @returns {Promise<object>} Resolves to an object with `updateCount` set to
 *   the number of updates that occurred.
 */
export async function syncCredentialStatus({
  syncId, getStatusUpdates, options
} = {}) {
  options = {
    // only supported options
    concurrency: options?.concurrency ?? 4,
    signal: options?.signal ?? undefined,
    limit: options?.limit ?? 100,
    ignoreCredentialNotFound: options?.ignoreCredentialNotFound ?? false
  };
  let updateCount = 0;
  let hasMore = false;
  try {
    // get previous `cursor` value from storage
    const syncRecord = await syncRecords.get({
      id: syncId,
      create: true
    });
    const {sync: {cursor: existingCursor}} = syncRecord;

    // get status updates to be applied to bring storage into sync
    // with some external status tracking system
    const {updates, cursor} = await getStatusUpdates({
      // use previous `cursor` value
      cursor: existingCursor,
      limit: options.limit ?? 100
    });

    // validate all status update objects
    updates.forEach(update => _assertStatusUpdate(update));

    // process updates efficiently in parallel
    const queue = new PQueue({
      autoStart: true,
      // maximum number of updates to attempt at once
      concurrency: options?.concurrency ?? 4,
      // maximum updates per second to avoid DoS of remote systems
      intervalCap: 60,
      // one second internal
      interval: 1000
    });
    queue.on('completed', () => updateCount++);

    // for any error that occurs in the task queue
    let error;

    for(const update of updates) {
      queue.add(async () => {
        // update status w/ one retry attempt if necessary
        return _updateStatus({update, options}).catch(
          () => _updateStatus({update, options}));
      }).catch(e => {
        // save any `error` var to be thrown at the end and clear queue to
        // stop any tasks that haven't started
        error = e;
        queue.clear();
      });
    }

    // wait for queue to complete
    await queue.onIdle();

    if(error) {
      throw error;
    }

    options?.signal?.throwIfAborted();

    // update sync record with new cursor
    await syncRecords.update({
      sync: {
        ...syncRecord.sync,
        sequence: syncRecord.sync.sequence + 1,
        cursor
      }
    });

    hasMore = cursor.hasMore ?? false;
  } catch(error) {
    logger.error(error.message, {error});
    throw error;
  }

  return {updateCount, hasMore};
}

function _assertStatusUpdate(update) {
  try {
    // assert identifying the target VC to update
    assert.object(update, 'update');

    if(update.reference !== undefined) {
      // assert optionally already-retrieved VC `reference` from VC reference
      // record
      const {reference} = update;
      assert.object(reference, 'update.reference');
      assert.string(reference.credentialId, 'update.reference.credentialId');
      if(update.credentialId !== undefined) {
        throw new TypeError(
          'Only one of "update.credentialId" or ' +
          '"update.reference" is allowed.');
      }
    } else {
      assert.string(update.credentialId, 'update.credentialId');
    }

    // assert optional changes to the VC's reference record
    assert.optionalObject(update.referenceUpdate, 'update.referenceUpdate');

    // assert fields for identifying/matching the status in the VC to update
    assert.object(update.status, 'update.status');
    assert.optionalString(
      update.status.indexAllocator, 'update.status.indexAllocator');
    assert.object(
      update.status.credentialStatus,
      'update.status.credentialStatus');
    // `type` and `statusPurpose` must be provided in `credentialStatus` at a
    // minimum
    assert.string(
      update.status.credentialStatus.type,
      'update.status.credentialStatus.type');
    assert.string(
      update.status.credentialStatus.statusPurpose,
      'update.status.credentialStatus.statusPurpose');

    // assert new status value
    assert.bool(update.status.value, 'update.status.value');

    // check optional status `expand` feature
    assert.optionalObject(update.expand, 'update.expand');
    if(update.expand) {
      const {expand} = update;
      // whether or not expansion is required or if matching can be attempted
      // without expansion
      assert.optionalBool(expand.required, 'update.expand.required');
      // the required `credentialStatus.type` to perform expansion
      assert.string(expand.type, 'update.expand.type');
      // only expansion type supported currently is:
      // `TerseBitstringStatusListEntry`
      if(expand.type !== 'TerseBitstringStatusListEntry') {
        throw new TypeError(
          '"update.status.expand.type" must be ' +
          '"TerseBitstringStatusListEntry"');
      }
      // supported expand options
      assert.optionalObject(expand.options);
      if(expand.options) {
        const {options} = expand;
        assert.optionalString(
          options.statusPurpose, 'update.expand.options.statusPurpose');
        assert.optionalNumber(
          options.listLength, 'update.expand.options.listLength');
      }
    }

    // assert zcaps to enable the status updates
    _assertCapability(
      update.getCredentialCapability,
      'update.getCredentialCapability');
    _assertCapability(
      update.updateStatusCapability,
      'update.updateStatusCapability');
  } catch(cause) {
    throw new BedrockError(
      'Invalid status update object.', {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }
}

function _assertCapability(capability, name) {
  const type = typeof capability;
  if(!(type === 'string' || type === 'object')) {
    throw new TypeError(`"${name}" must be a string or object.`);
  }
}

function _getInvocationTarget({capability}) {
  if(typeof capability === 'string') {
    return decodeURIComponent(capability.slice(ROOT_ZCAP_PREFIX.length));
  }
  return capability.invocationTarget;
}

async function _getVerifiableCredential({
  credentialId, capability, ignoreCredentialNotFound
}) {
  // get VC
  let verifiableCredential;
  try {
    const invocationTarget = _getInvocationTarget({capability});
    const url = `${invocationTarget}/${encodeURIComponent(credentialId)}`;
    const response = await zcapClient.read({url, capability});
    ({verifiableCredential} = response.data);
  } catch(cause) {
    if(cause.status === 404 && ignoreCredentialNotFound) {
      return null;
    }
    throw new BedrockError(
      'Could not get verifiable credential.', {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }
  return verifiableCredential;
}

async function _updateStatus({update, options} = {}) {
  const {signal, ignoreCredentialNotFound} = options;

  const {
    reference: existingReference, referenceUpdate,
    getCredentialCapability, updateStatusCapability, status
  } = update;
  const credentialId = update.credentialId ?? existingReference.credentialId;

  try {
    signal?.throwIfAborted();

    // get VC and its reference information
    const [
      verifiableCredential,
      {reference},
    ] = await Promise.all([
      _getVerifiableCredential({
        credentialId, capability: getCredentialCapability,
        ignoreCredentialNotFound
      }),
      update.reference ? update : vcReferences.get({credentialId})
    ]);

    signal?.throwIfAborted();

    if(!(verifiableCredential === null && ignoreCredentialNotFound)) {
      // update remote statuses before internal status to promote consistency
      await _updateRemoteStatus({
        verifiableCredential, reference, updateStatusCapability, status
      });
    }

    signal?.throwIfAborted();

    // now update local status if `referenceUpdate` was provided
    if(referenceUpdate) {
      await vcReferences.update({
        reference: {
          ...reference,
          ...referenceUpdate,
          sequence: reference.sequence + 1
        }
      });
    }
  } catch(cause) {
    if(cause.name === 'AbortError') {
      throw cause;
    }
    throw new BedrockError(
      `Could not sync status for credential ID "${credentialId}".`, {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }
}

async function _updateRemoteStatus({
  verifiableCredential, reference, updateStatusCapability, status
}) {
  const {credentialId} = reference;

  try {
    // check index allocator/reuse existing one from reference
    let {indexAllocator} = status;
    if(reference.indexAllocator !== undefined) {
      if(indexAllocator === undefined) {
        indexAllocator = reference.indexAllocator;
      } else if(indexAllocator !== reference.indexAllocator) {
        throw new BedrockError('Index allocator mismatch.', {
          name: 'ConstraintError',
          details: {httpStatusCode: 409, public: true}
        });
      }
    }

    // find matching credential status entry in VC
    const {credentialStatus: target, expand, value} = status;
    const credentialStatus = _matchCredentialStatus({
      verifiableCredential, expand, targetCredentialStatus: target
    });

    // update VC status
    await zcapClient.write({
      capability: updateStatusCapability,
      json: {
        credentialId,
        credentialStatus,
        indexAllocator,
        status: value
      }
    });
  } catch(cause) {
    throw new BedrockError(
      'Could not update verifiable credential status.', {
        name: 'OperationError',
        details: {
          httpStatusCode: cause?.details?.httpStatusCode ?? 500,
          public: true
        },
        cause
      });
  }
}

function _matchCredentialStatus({
  verifiableCredential, expand, targetCredentialStatus
}) {
  let allStatuses = verifiableCredential.credentialStatus;
  if(!Array.isArray(allStatuses)) {
    allStatuses = [allStatuses];
  }
  const matches = allStatuses.map(cs => {
    // if `expand` is present, match on its `type` first
    if(expand) {
      if(expand.type === cs.type) {
        // perform expansion
        cs = expandCredentialStatus({credentialStatus: cs, ...expand.options});
      } else if(expand.required !== false) {
        // `expand.type` doesn't match and expansion is required (note: default
        // for `required` is true), so skip
        return false;
      }
    }

    // now match against target `credentialStatus` fields
    for(const key of Object.keys(targetCredentialStatus)) {
      if(cs?.[key] !== targetCredentialStatus[key]) {
        return false;
      }
    }
    return cs;
  }).filter(e => !!e);

  // one match found, success
  if(matches.length === 1) {
    return matches[0];
  }

  // multiple matches found
  if(matches.length > 1) {
    throw new BedrockError(
      'Could not update verifiable credential status; ' +
      'multiple status entries match target credential status.', {
        name: 'ConstraintError',
        details: {httpStatusCode: 400, public: true, targetCredentialStatus}
      });
  }
  throw new BedrockError(
    'Could not update verifiable credential status; ' +
    'no matching status entry found.', {
      name: 'NotFoundError',
      details: {httpStatusCode: 404, public: true, targetCredentialStatus}
    });
}
