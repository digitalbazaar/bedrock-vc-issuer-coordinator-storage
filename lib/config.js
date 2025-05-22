/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';

const cfg = config['vc-issuer-coordinator-storage'] = {};

// in-memory caches
cfg.caches = {
  vcReference: {
    // 1000 means 1000 of the most popular cached entries can stay in memory
    max: 1000,
    // 5 minutes
    ttl: 5 * 60 * 1000
  }
};

cfg.tasks = {
  // used to encrypt task secrets that are stored in task records
  recordEncryption: {
    // HMAC key for producing task IDs
    hmacKey: null,
    /*
    hmacKey: {
      id: '<a key identifier>',
      secretKeyMultibase: '<multibase encoding of an AES-256 secret key>'
    }*/
    // current key encryption key for wrapping randomly-generated content
    // encryption keys used to encrypt task secrets at task record creation
    // time; existing task records w/o task secrets encryption will be
    // unaffected by a configuration change here
    kek: null,
    /*
    kek: {
      id: '<a key identifier>',
      secretKeyMultibase: '<multibase encoding of an AES-256 secret key>'
    }*/
  }
};
