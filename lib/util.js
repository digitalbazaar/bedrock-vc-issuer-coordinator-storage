/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import canonicalize from 'canonicalize';
import crypto from 'node:crypto';

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
