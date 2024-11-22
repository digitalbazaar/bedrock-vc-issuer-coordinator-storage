/*!
 * Copyright (c) 2021-2024 Digital Bazaar, Inc. All rights reserved.
 */
export const mockData = {};

const now = Date.now();

export const mockRecord1 = {
  meta: {
    created: now,
    updated: now
  },
  reference: {
    credentialId: 'urn:uuid:43f14128-3b42-11ec-8d3d-0242ac130003',
    sequence: 0
  }
};

export const mockRecord2 = {
  meta: {
    created: now,
    updated: now
  },
  reference: {
    credentialId: 'urn:uuid:448de567-5e19-4a54-8b0e-1d0e2128f13d',
    sequence: 0
  }
};
