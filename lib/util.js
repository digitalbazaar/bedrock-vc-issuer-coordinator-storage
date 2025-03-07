/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import canonicalize from 'canonicalize';
import crypto from 'node:crypto';

const DEFAULT_TERSE_LIST_LENGTH = 67108864;

/**
 * Creates a content-based identifier from some content (object, string,
 * boolean, etc.). This utility function is useful for applications that want
 * to consistently (re-)generate IDs based on other content fields.
 *
 * @param {object} options - Options to use.
 * @param {*} [options.content] - The content to generate an ID from.
 * @param {string} [options.secret=null] - The secret key to use.
 *
 * @returns {Promise<object>} Resolves to an object with `id`.
 */
export async function createContentId({content, secret = null} = {}) {
  // canonicalize object to a string
  const string = canonicalize(content);

  let digest;
  if(secret) {
    // hmac string
    digest = await _hs256({secret, string});
  } else {
    // hash string
    digest = await _sha256({string});
  }

  // express digest as multibase-multihash string
  // 18 = 0x12 means sha2-256
  // 32 is the digest length in bytes
  const mh = Buffer.concat([Buffer.from([18, 32]), Buffer.from(digest)]);
  const id = mh.toString('base64url');
  return {id};
}

/**
 * Expands `TerseBitstringStatusListEntry` to `BitstringStatusListEntry`. If
 * the given `credentialStatus` value is already of type
 * `BitstringStatusListEntry` then it will be returned without modification. If
 * it is another type, an error will be thrown.
 *
 * @param {object} options - Options to use.
 * @param {object} [options.credentialStatus] - The credential status entry
 *   value to expand.
 * @param {string} [options.statusPurpose='revocation'] - The status purpose to
 *   use in the expanded credential status entry.
 * @param {number} [options.listLength=67108864] - The credential status entry
 *   value to expand.
 *
 * @returns {object} The expanded credential status entry.
 */
export function expandCredentialStatus({
  credentialStatus, statusPurpose = 'revocation',
  listLength = DEFAULT_TERSE_LIST_LENGTH
} = {}) {
  if(!(credentialStatus && typeof credentialStatus === 'object')) {
    throw new TypeError('"credentialStatus" must be an object.');
  }
  if(typeof statusPurpose !== 'string') {
    throw new TypeError('"statusPurpose" must be a string.');
  }
  if(typeof listLength !== 'number') {
    throw new TypeError('"listLength" must be a number.');
  }
  if(credentialStatus.type === 'BitstringStatusListEntry') {
    // already a `BitstringStatusListEntry`; return as-is
    return credentialStatus;
  }
  if(credentialStatus.type !== 'TerseBitstringStatusListEntry') {
    throw new Error(
      'Credential status entry type must be "TerseBitstringStatusListEntry".');
  }

  const {
    terseStatusListBaseUrl,
    terseStatusListIndex
  } = credentialStatus;
  if(typeof terseStatusListBaseUrl !== 'string') {
    throw new TypeError(
      '"credentialStatus.terseStatusListBaseUrl" must be a string.');
  }
  if(typeof terseStatusListIndex !== 'number') {
    throw new TypeError(
      '"credentialStatus.terseStatusListIndex" must be a number.');
  }

  // compute `statusListCredential` from other params
  const listIndex = Math.floor(terseStatusListIndex / listLength);
  const statusListIndex = terseStatusListIndex % listLength;
  const statusListCredential =
    `${terseStatusListBaseUrl}/${statusPurpose}/${listIndex}`;
  return {
    type: 'BitstringStatusListEntry',
    statusListCredential,
    statusListIndex: `${statusListIndex}`,
    statusPurpose
  };
}

/**
 * HMAC-SHA-256 hashes a string.
 *
 * @param {object} options - The options to use.
 * @param {string} options.secret - The secret key to use.
 * @param {string} options.string - The string to hash.
 *
 * @returns {Uint8Array} The hash digest.
 */
async function _hs256({secret, string}) {
  return new Uint8Array(
    crypto.createHmac('sha256', secret).update(string).digest());
}

/**
 * SHA-256 hashes a string.
 *
 * @param {object} options - The options to use.
 * @param {string} options.string - The string to hash.
 *
 * @returns {Uint8Array} The hash digest.
 */
async function _sha256({string}) {
  return new Uint8Array(crypto.createHash('sha256').update(string).digest());
}
