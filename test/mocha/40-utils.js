/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {utils} from '@bedrock/vc-issuer-coordinator-storage';

describe('Utils API', function() {
  describe('expandCredentialStatus()', () => {
    it('leaves BitstringStatusListEntry alone', async () => {
      const expanded = utils.expandCredentialStatus({
        credentialStatus: {
          type: 'BitstringStatusListEntry',
          statusPurpose: 'revocation'
        }
      });
      const expected = {
        type: 'BitstringStatusListEntry',
        statusPurpose: 'revocation'
      };
      expanded.should.deep.equal(expected);
    });

    it('expands TerseBitstringStatusEntry w/defaults', async () => {
      const expanded = utils.expandCredentialStatus({
        credentialStatus: {
          type: 'TerseBitstringStatusListEntry',
          terseStatusListBaseUrl:
            'https://status.example/statuses/1/status-lists',
          terseStatusListIndex: 4000000001
        }
      });
      const expected = {
        type: 'BitstringStatusListEntry',
        statusPurpose: 'revocation',
        statusListCredential:
          'https://status.example/statuses/1/status-lists/revocation/59',
        statusListIndex: '40577025'
      };
      expanded.should.deep.equal(expected);
    });

    it('expands TerseBitstringStatusEntry w/statusPurpose', async () => {
      const expanded = utils.expandCredentialStatus({
        credentialStatus: {
          type: 'TerseBitstringStatusListEntry',
          terseStatusListBaseUrl:
            'https://status.example/statuses/1/status-lists',
          terseStatusListIndex: 4000000001
        },
        statusPurpose: 'suspension'
      });
      const expected = {
        type: 'BitstringStatusListEntry',
        statusPurpose: 'suspension',
        statusListCredential:
          'https://status.example/statuses/1/status-lists/suspension/59',
        statusListIndex: '40577025'
      };
      expanded.should.deep.equal(expected);
    });

    it('expands TerseBitstringStatusEntry w/listLength', async () => {
      const expanded = utils.expandCredentialStatus({
        credentialStatus: {
          type: 'TerseBitstringStatusListEntry',
          terseStatusListBaseUrl:
            'https://status.example/statuses/1/status-lists',
          terseStatusListIndex: 4000000001
        },
        listLength: 131072
      });
      const expected = {
        type: 'BitstringStatusListEntry',
        statusPurpose: 'revocation',
        statusListCredential:
          'https://status.example/statuses/1/status-lists/revocation/30517',
        statusListIndex: '75777'
      };
      expanded.should.deep.equal(expected);
    });
  });
});
