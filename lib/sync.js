/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as vcReferences from './vcReferences.js';
import {zcapClient} from './zcapClient.js';

const {util: {BedrockError}} = bedrock;
const ROOT_ZCAP_PREFIX = 'urn:zcap:root:';

export async function syncCredentialStatus({
  asyncIteratorFn

} = {}) {
  // FIXME: implement
  console.log('syncing credential status...');

  /*
  * abstract bulk sync process
    * syncing to an external data source; take a function
      that will return an async iterator that returns
      a credential ID to sync, the new status to use, any
      extra reference fields to update and a cursor value
      that can be used to store progress; the iterator
      function should take that cursor as an optional
      param; the "cursor" would be stored in a collection
      in the vc issuer coordinator storage whenever it
      felt appropriate to store it (either every write or
      after the whole async iterator was processed); might
      need a limit to pass as well
    * ensure this API can be used with an iterator that
      would cause the not-latest VCs to get revoked
  */
  try {
    const asyncIterator = asyncIteratorFn({
      cursor: 'FIXME',
      // FIXME: can a limit be sensibly passed here?
      limit: 1000
    });

    // FIXME: create p-queue? pass queue?
    const queue = {
      jobs: []
    };
    queue.add = job => queue.jobs.push(job);

    for await (const update of asyncIterator) {
      queue.add(async () => _updateStatus({update}));
    }

    console.log('queue', queue);
    await Promise.all(queue.jobs.map(job => job()));
    console.log(`all VC statuses have been sync'd`);

    // FIXME: wait for queue to complete
  } catch(e) {
    console.log('error', e);
  }

  return new Promise(r => setTimeout(() => r(true), 250));
}

async function _updateStatus({update} = {}) {
  const {
    credentialId, newReferenceFields,
    getCredentialCapability, updateStatusCapability,
    status
  } = update;

  // get existing reference
  let reference;
  try {
    ({reference} = await vcReferences.get({credentialId}));

    // update remote status before internal status to promote consistency
    // FIXME: use `result`?
    //const result = await _updateRemoteStatus({
    await _updateRemoteStatus({
      // FIXME: improve `status`; may be multiple statuses
      credentialId, getCredentialCapability, updateStatusCapability, status
    });

    console.log('updated remote status for', credentialId);

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
    // FIXME: if cause is a sequencing error ... try again?

    throw new BedrockError(
      `Could not sync status for credential ID "${credentialId}".`, {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }
}

async function _updateRemoteStatus({
  credentialId, getCredentialCapability, updateStatusCapability
}) {
  // get VC
  let verifiableCredential;
  try {
    const invocationTarget = _getInvocationTarget(getCredentialCapability);
    const url = `${invocationTarget}/${encodeURIComponent(credentialId)}`;
    console.log('URL', url);
    const response = await zcapClient.read({
      url, capability: getCredentialCapability
    });
    ({verifiableCredential} = response.data);
  } catch(cause) {
    throw new BedrockError(
      'Could not get verifiable credential.', {
        name: 'OperationError',
        details: {httpStatusCode: 500, public: true},
        cause
      });
  }

  // FIXME: use `@digitalbazaar/vc-status-updater`?

  // update VC status
  try {
    // FIXME: parse `credentialStatus` from VC
    await zcapClient.write({
      capability: updateStatusCapability,
      json: {
        credentialId,
        credentialStatus: {
          type: 'BitstringStatusListEntry',
          statusPurpose: 'revocation'
        },
        status: true
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

  // FIXME: return updated status info
  return {verifiableCredential};
}

function _getInvocationTarget(zcap) {
  if(typeof zcap === 'string') {
    return decodeURIComponent(zcap.slice(ROOT_ZCAP_PREFIX.length));
  }
  return zcap.invocationTarget;
}
