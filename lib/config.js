/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';

const cfg = config['vc-issuer-coordinator-storage'] = {};

// in-memory caches
cfg.caches = {
  vcReference: {
    // 1000 means 1000 of the most popular cached entries can stay in memory
    maxSize: 1000
  }
};
