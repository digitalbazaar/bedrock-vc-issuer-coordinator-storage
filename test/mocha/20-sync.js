/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as helpers from './helpers.js';
import {
  syncCredentialStatus, vcReferences
} from '@bedrock/vc-issuer-coordinator-storage';
import {randomUUID} from 'node:crypto';

describe.only('Sync API', function() {
  describe('syncCredentialStatus()', () => {
    let credentialIds;
    beforeEach(async () => {
      // add three example records to sync
      await helpers.cleanDatabase();
      credentialIds = [];
      for(let i = 0; i < 3; ++i) {
        const credentialId = `urn:uuid:${randomUUID()}`;
        credentialIds.push(credentialId);
        await vcReferences.insert({
          reference: {
            sequence: 0,
            credentialId
          }
        });
      }
    });

    it('syncs credential status', async () => {
      let err;
      let result;
      try {
        result = await syncCredentialStatus({
          async *asyncIteratorFn() {
            for(const credentialId of credentialIds) {
              yield {
                credentialId,
                newReferenceFields: {},
                getCredentialCapability: {},
                updateStatusCapability: {},
                status: true
              };
            }
          }
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      should.exist(result);
    });
  });
});
