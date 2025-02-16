/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {syncCredentialStatus} from '@bedrock/vc-issuer-coordinator-storage';

describe.only('Sync API', function() {
  describe('syncCredentialStatus()', () => {
    it('syncs credential status', async () => {
      let err;
      let result;
      try {
        result = await syncCredentialStatus({
          async *asyncIteratorFn() {
            yield {
              credentialId: '',
              newReferenceFields: {},
              getCredentialCapability: {},
              updateStatusCapability: {},
              status: true,
            };
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
