/*!
 * Copyright (c) 2019-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {generalDecrypt, GeneralEncrypt} from 'jose';
import {createContentId} from './util.js';
import {logger} from './logger.js';

const {util: {BedrockError}} = bedrock;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const NON_SECRET_PROPERTIES = new Set(['id', 'sequence', 'expires']);

/* Multikey registry IDs and encoded header values
aes-256 | 0xa2 | 256-bit AES symmetric key
*/
const SUPPORTED_KEY_TYPES = new Map([
  ['aes-256', {header: new Uint8Array([0xa2, 0x01]), size: 32}]
]);

// load all HMAC keys and KEKs from config
const HMAC_KEYS = new Map();
const KEKS = new Map();
bedrock.events.on('bedrock.init', () => {
  _loadKeys();
});

// pass `task` from a task `record`
export async function decryptTaskSecrets({task} = {}) {
  if(task.encrypted === undefined) {
    // nothing to unwrap, return early
    return task;
  }

  try {
    // decrypt encrypted task
    const {kekId, jwe} = task.encrypted;
    const secretKey = _getKek(kekId);
    const {plaintext} = await generalDecrypt(jwe, secretKey);
    const secrets = JSON.parse(TEXT_DECODER.decode(plaintext));

    // new task object w/decrypted secrets
    task = {...task, ...secrets};
    delete task.encrypted;
    return task;
  } catch(cause) {
    throw new BedrockError('Could not decrypt record secrets.', {
      name: 'OperationError',
      cause,
      details: {
        public: true,
        httpStatusCode: 500
      }
    });
  }
}

// pass `task` from a task `record`
export async function encryptTaskSecrets({task} = {}) {
  try {
    if(task.encrypted !== undefined) {
      // should not happen; bad call
      throw new Error(
        'Could not encrypt record secrets; ' +
        'record secrets already encrypted.');
    }

    // get current KEK ID
    const cfg = _getConfig();
    const kekId = cfg.kek?.id;
    if(!kekId) {
      // no KEK config; return early
      return task;
    }

    // separate record task's non-secret / secret properties
    const nonSecrets = new Map();
    const secrets = new Map();
    for(const prop in task) {
      const value = task[prop];
      if(NON_SECRET_PROPERTIES.has(prop)) {
        nonSecrets.set(prop, value);
        continue;
      }
      secrets.set(prop, value);
    }

    // encrypt task secrets
    const plaintext = _mapToBuffer(secrets);
    const secretKey = _getKek(kekId);
    const jwe = await new GeneralEncrypt(plaintext)
      .setProtectedHeader({enc: 'A256GCM'})
      .addRecipient(secretKey)
      .setUnprotectedHeader({alg: 'A256KW', kid: kekId})
      .encrypt();

    // return new task object w/encrypted secrets
    return {
      ...Object.fromEntries(nonSecrets.entries()),
      encrypted: {kekId, jwe}
    };
  } catch(cause) {
    throw new BedrockError('Could not encrypt record secrets.', {
      name: 'OperationError',
      cause,
      details: {
        public: true,
        httpStatusCode: 500
      }
    });
  }
}

// create a task record ID using the task `request`
export async function createTaskId({request} = {}) {
  // get prefix and current HMAC key
  let prefix;
  let hmacKey;
  const cfg = _getConfig();
  const hmacKeyId = cfg.hmacKey?.id;
  if(hmacKeyId) {
    // an HMAC key is required to keep any task secrets confidential
    hmacKey = _getHmacKey(hmacKeyId);
    prefix = `urn:hmac:${encodeURIComponent(hmacKeyId)}:`;
  } else {
    prefix = 'urn:hash:';
  }

  const {id} = createContentId({content: request, secret: hmacKey});
  return {id: prefix + id};
}

function _getHmacKey(id) {
  const secretKey = HMAC_KEYS.get(id);
  if(secretKey) {
    return secretKey;
  }
  throw new BedrockError(`HMAC key "${id}" not found.`, {
    name: 'NotFoundError',
    details: {
      public: true,
      httpStatusCode: 400
    }
  });
}

function _getKek(id) {
  const secretKey = KEKS.get(id);
  if(secretKey) {
    return secretKey;
  }
  throw new BedrockError(`Key encryption key "${id}" not found.`, {
    name: 'NotFoundError',
    details: {
      public: true,
      httpStatusCode: 400
    }
  });
}

function _getConfig() {
  const cfg = bedrock.config['vc-issuer-coordinator-storage'];
  return cfg.tasks.recordEncryption;
}

function _loadKey(secretKeyMultibase) {
  if(!secretKeyMultibase?.startsWith('u')) {
    throw new BedrockError(
      'Unsupported multibase header; ' +
      '"u" for base64url-encoding must be used.', {
        name: 'NotSupportedError',
        details: {
          public: true,
          httpStatusCode: 400
        }
      });
  }

  // check multikey header
  let keyType;
  let secretKey;
  const multikey = Buffer.from(secretKeyMultibase.slice(1), 'base64url');
  for(const [type, {header, size}] of SUPPORTED_KEY_TYPES) {
    if(multikey[0] === header[0] && multikey[1] === header[1]) {
      keyType = type;
      if(multikey.length !== (2 + size)) {
        // intentionally do not report what was detected because a
        // misconfigured secret could have its first two bytes revealed
        throw new BedrockError(
          'Incorrect multikey size or invalid multikey header.', {
            name: 'DataError',
            details: {
              public: true,
              httpStatusCode: 400
            }
          });
      }
      secretKey = multikey.subarray(2);
      break;
    }
  }
  if(keyType === undefined) {
    throw new BedrockError(
      'Unsupported multikey type; only AES-256 is supported.', {
        name: 'NotSupportedError',
        details: {
          public: true,
          httpStatusCode: 400
        }
      });
  }

  return secretKey;
}

// exported for testing purposes only
export function _loadKeys() {
  HMAC_KEYS.clear();
  KEKS.clear();
  const {hmacKey, kek} = _getConfig();
  if(!(hmacKey && kek)) {
    logger.info('Task record encryption is disabled.');
  } else {
    if(!(hmacKey.id && typeof hmacKey.id === 'string')) {
      throw new BedrockError(
        'Invalid HMAC key configuration; key "id" must be a string.', {
          name: 'DataError',
          details: {
            public: true,
            httpStatusCode: 400
          }
        });
    }
    if(!(kek.id && typeof kek.id === 'string')) {
      throw new BedrockError(
        'Invalid key encryption key configuration; ' +
        'key "id" must be a string.', {
          name: 'DataError',
          details: {
            public: true,
            httpStatusCode: 400
          }
        });
    }
    HMAC_KEYS.set(hmacKey.id, _loadKey(hmacKey.secretKeyMultibase));
    KEKS.set(kek.id, _loadKey(kek.secretKeyMultibase));
    logger.info('Task record encryption is enabled.');
  }
}

function _mapToBuffer(m) {
  return TEXT_ENCODER.encode(JSON.stringify(Object.fromEntries(m.entries())));
}
