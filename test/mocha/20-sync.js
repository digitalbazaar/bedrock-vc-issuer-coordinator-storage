/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as helpers from './helpers.js';
import {
  syncCredentialStatus, vcReferences, utils
} from '@bedrock/vc-issuer-coordinator-storage';
import {randomUUID} from 'node:crypto';

describe('Sync API', function() {
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

      // there should be no update to the reference records
      for(const credentialId of credentialIds) {
        const record = await vcReferences.get({credentialId});
        record.reference.sequence.should.equal(0);
      }
    });

    // FIXME: use status entry expansion helper for this
    it.skip('syncs TerseBitstringStatusEntry credential status', async () => {
      // test leaving `BitstringStatusListEntry` alone and
      // expanding `TerseBitstringStatusListEntry`
      const statusEntries = new Map([
        // for even indexes w/cursor below use `BitstringStatusListEntry`
        [0, {
          type: 'BitstringStatusListEntry',
          statusPurpose: 'revocation'
        }],
        // for odd indexes use `TerseBitstringStatusListEntry`
        [1, {
          type: 'TerseBitstringStatusListEntry',
          terseStatusListBaseUrl: 'https://status.example/status-lists',
          terseStatusListIndex: 9876543210
        }]
      ]);

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
                getCredentialCapability,
                updateStatusCapability,
                status: {
                  // FIXME: use status expansion helper
                  // utils.expandCredentialStatus({
                  //   credentialStatus: statusEntries.get(index % 2),
                  //   statusPurpose: 'revocation'
                  // })
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

      // there should be no update to the reference records
      for(const credentialId of credentialIds) {
        const record = await vcReferences.get({credentialId});
        record.reference.sequence.should.equal(0);
      }
    });

    it('syncs credential status w/reference update', async () => {
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
                referenceUpdate: {
                  newProperty: `foo-${credentialId}`
                },
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

      // there should be updates to the reference records
      for(const credentialId of credentialIds) {
        const record = await vcReferences.get({credentialId});
        record.reference.sequence.should.equal(1);
        record.reference.newProperty.should.equal(`foo-${credentialId}`);
      }
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
