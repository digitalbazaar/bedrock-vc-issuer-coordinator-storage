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
          syncId: 'test1',
          async getStatusUpdates({cursor = {index: 0}, limit = 100} = {}) {
            const updates = [];
            let {index = 0} = cursor;
            while(index < credentialIds.length) {
              if(updates.length === limit) {
                break;
              }
              const credentialId = credentialIds[index++];
              updates.push({
                credentialId,
                // FIXME: if not present, then skip local record update,
                // only remote status update is required
                newReferenceFields: {},
                getCredentialCapability,
                updateStatusCapability,
                status: {
                  credentialStatus: {
                    type: 'BitstringStatusListEntry',
                    statusPurpose: 'revocation'
                  },
                  value: true
                }
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

    it('syncs credential status w/multiple calls', async () => {
      // do more than 1 call to test zero updates
      const calls = credentialIds.length + 1;
      for(let i = 0; i < calls; ++i) {
        let err;
        let result;
        try {
          result = await syncCredentialStatus({
            syncId: 'test2',
            async getStatusUpdates({cursor = {index: 0}} = {}) {
              // force a limit of 1
              const limit = 1;
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
                  status: {
                    credentialStatus: {
                      type: 'BitstringStatusListEntry',
                      statusPurpose: 'revocation'
                    },
                    value: true
                  }
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
        if(i === credentialIds.length) {
          result.updateCount.should.equal(0);
        } else {
          result.updateCount.should.equal(1);
        }
      }
    });
  });
});
