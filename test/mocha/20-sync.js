/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as helpers from './helpers.js';
import {
  syncCredentialStatus, vcReferences
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

    it('syncs TerseBitstringStatusEntry credential status', async () => {
      // add a VC w/a terse bitstring status entry (signal in the test suite
      // is to append `:terse` to the credential ID)
      {
        const credentialId = `urn:uuid:${randomUUID()}:terse`;
        credentialIds.push(credentialId);
        await vcReferences.insert({
          reference: {
            sequence: 0,
            credentialId
          }
        });
      }

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
                  // ensure `expand` is only on for credential IDs with
                  // terse (signal in this test is that the ID ends w/`:terse`)
                  expand: !credentialId.endsWith(':terse') ? undefined : {
                    type: 'TerseBitstringStatusListEntry',
                    // default is also true
                    required: true,
                    options: {
                      statusPurpose: 'revocation'
                    }
                  },
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
      result.updateCount.should.equal(4);

      // there should be no update to the reference records
      for(const credentialId of credentialIds) {
        const record = await vcReferences.get({credentialId});
        record.reference.sequence.should.equal(0);
      }
    });

    it('syncs w/optional expand feature', async () => {
      // add a VC w/a terse bitstring status entry (signal in the test suite
      // is to append `:terse` to the credential ID)
      {
        const credentialId = `urn:uuid:${randomUUID()}:terse`;
        credentialIds.push(credentialId);
        await vcReferences.insert({
          reference: {
            sequence: 0,
            credentialId
          }
        });
      }

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
              const credentialId = credentialIds[index];
              updates.push({
                credentialId,
                getCredentialCapability,
                updateStatusCapability,
                status: {
                  expand: {
                    // do not require expansion
                    required: false,
                    type: 'TerseBitstringStatusListEntry',
                    options: {
                      statusPurpose: 'revocation'
                    }
                  },
                  credentialStatus: {
                    type: 'BitstringStatusListEntry',
                    statusPurpose: 'revocation'
                  },
                  value: true
                }
              });
              index++;
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
      result.updateCount.should.equal(4);

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
