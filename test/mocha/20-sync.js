/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as helpers from './helpers.js';
import {
  syncCredentialStatus, vcReferences
} from '@bedrock/vc-issuer-coordinator-storage';
import {randomUUID} from 'node:crypto';

describe.only('Sync API', function() {
  describe('syncCredentialStatus()', () => {
    let credentialIds;
    let getCredentialCapability;
    let updateStatusCapability;
    beforeEach(async () => {
      const {baseUri} = bedrock.config.server;
      getCredentialCapability = 'urn:zcap:root:' +
        encodeURIComponent(`${baseUri}/issuers/1/credentials`);
      updateStatusCapability = 'urn:zcap:root:' +
        encodeURIComponent(`${baseUri}/statuses/1/credentials/status`);

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
          async getStatusUpdates({cursor = {index: 0}, limit = 1000} = {}) {
            const updates = [];
            let {index = 0} = cursor;
            while(index < credentialIds.length) {
              if(updates.length === limit) {
                break;
              }
              const credentialId = credentialIds[index++];
              updates.push({
                credentialId,
                newReferenceFields: {},
                getCredentialCapability,
                updateStatusCapability,
                status: true
              });
            }
            return {
              updates,
              cursor: {
                // common field
                hasMore: index < (credentialIds.length - 1),
                // use-case specific fields
                index
              }
            };
          }
        });
      } catch(e) {
        err = e;
      }
      assertNoError(err);
      should.exist(result);
      result.updateCount.should.equal(3);
    });
  });
});
