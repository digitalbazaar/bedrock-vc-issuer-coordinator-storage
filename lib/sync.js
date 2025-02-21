/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as syncRecords from './syncRecords.js';
import * as vcReferences from './vcReferences.js';
import assert from 'assert-plus';
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
 *
 * @returns {Promise<object>} Resolves to an object with `updateCount` set to
 *   the number of updates that occurred.
 */
export async function syncCredentialStatus({
  syncId,
  getStatusUpdates,
  options = {
    // only supported options
    concurrency: 4,
    signal: undefined
  }
} = {}) {
  // FIXME: remove logging
  console.log('syncing credential status...');

  let updateCount = 0;
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
      limit: 100
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
    // FIXME: remove as unnecessary?
    queue.on('completed', () => updateCount++);

    // for any error that occurs in the task queue
    let error;

    for(const update of updates) {
      queue.add(async ({signal}) => {
        // update status w/ one retry attempt if necessary
        return _updateStatus({update, signal}).catch(
          () => _updateStatus({update, signal}));
      }, {signal: options?.signal})
        // save any `error` var to be thrown at the end and trip signal
        .catch(e => error = e);
    }

    // wait for queue to complete
    await queue.onIdle();

    if(error) {
      throw error;
    }

    _abortIfSignaled(options?.signal);

    // update sync record with new cursor
    await syncRecords.update({
      sync: {
        ...syncRecord.sync,
        sequence: syncRecord.sync.sequence + 1,
        cursor
      }
    });
  } catch(error) {
    logger.error(error.message, {error});
    throw error;
  }

  return {updateCount};
}

function _assertStatusUpdate(update) {
  try {
    assert.object(update, 'update');
    assert.string(update.credentialId, 'update.credentialId');
    assert.optionalObject(
      update.newReferenceFields,
      'update.newReferenceFields');
    assert.object(update.status, 'update.status');
    assert.object(
      update.status.credentialStatus,
      'update.status.credentialStatus');
    if(update.status.credentialStatus.type !== 'BitstringStatusListEntry') {
      throw new TypeError(
        '"update.status.credentialStatus.type" must be ' +
        '"BitstringStatusListEntry"');
    }
    assert.string(
      update.status.credentialStatus.statusPurpose,
      'update.status.credentialStatus.statusPurpose');
    assert.bool(update.status.value, 'update.status.value');
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

async function _getVerifiableCredential({credentialId, capability}) {
  // get VC
  let verifiableCredential;
  try {
    const invocationTarget = _getInvocationTarget({capability});
    const url = `${invocationTarget}/${encodeURIComponent(credentialId)}`;
    const response = await zcapClient.read({url, capability});
    ({verifiableCredential} = response.data);
  } catch(cause) {
    throw new BedrockError(
      'Could not get verifiable credential.', {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }
  return verifiableCredential;
}

async function _updateStatus({update, signal} = {}) {
  const {
    credentialId, newReferenceFields = {},
    getCredentialCapability, updateStatusCapability, status
  } = update;

  try {
    _abortIfSignaled(signal);

    // get VC and its reference information
    const [
      verifiableCredential,
      {reference},
    ] = await Promise.all([
      _getVerifiableCredential({
        credentialId, capability: getCredentialCapability
      }),
      vcReferences.get({credentialId})
    ]);

    _abortIfSignaled(signal);

    // update remote statuses before internal status to promote consistency
    await _updateRemoteStatus({
      credentialId, verifiableCredential, updateStatusCapability, status
    });

    _abortIfSignaled(signal);

    // FIXME: remove logging
    console.log('updated remote statuses for', credentialId);

    // FIXME: if `newReferenceFields` not present, then skip local record
    // update, only remote status update is required

    // now update local status
    await vcReferences.update({
      reference: {
        // FIXME: improve name for `newReferenceFields` variable
        ...newReferenceFields,
        credentialId,
        sequence: reference.sequence + 1
      }
    });

    console.log('updated local status for', credentialId);
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
  credentialId, verifiableCredential, updateStatusCapability, status
}) {
  // FIXME: use `@digitalbazaar/vc-status-updater`?

  try {
    // find matching credential status entry in VC
    const {credentialStatus: {statusPurpose}, value} = status;
    const credentialStatus = _matchCredentialStatus({
      verifiableCredential, statusPurpose
    });

    // update VC status
    await zcapClient.write({
      capability: updateStatusCapability,
      json: {
        credentialId,
        credentialStatus,
        status: value
      }
    });
  } catch(cause) {
    throw new BedrockError(
      'Could not update verifiable credential status.', {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }
}

function _matchCredentialStatus({verifiableCredential, statusPurpose}) {
  let allStatuses = verifiableCredential.credentialStatus;
  if(!Array.isArray(allStatuses)) {
    allStatuses = [allStatuses];
  }
  const match = allStatuses.find(cs => {
    if(cs.type === 'TerseBitstringStatusListEntry') {
      // terse bitstring status list is always a match for
      // `revocation` or `suspension`
      return statusPurpose === 'revocation' || statusPurpose === 'suspension';
    }
    if(cs.type === 'BitstringStatusListEntry') {
      return cs.statusPurpose === statusPurpose;
    }
  });
  if(match) {
    return match;
  }
  throw new BedrockError(
    'Could not update verifiable credential status; ' +
    `status entry for status purpose "${statusPurpose}" not found.`, {
      name: 'NotFoundError',
      details: {httpStatusCode: 404, public: true}
    });
}

function _abortIfSignaled(signal) {
  if(signal?.aborted) {
    const error = new Error('Operation aborted.');
    error.name = 'AbortError';
    throw error;
  }
}
