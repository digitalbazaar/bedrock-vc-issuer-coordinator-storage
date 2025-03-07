/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {asyncHandler} from '@bedrock/express';
import '@bedrock/vc-issuer-coordinator-storage';

// in-memory credential status changes
const STATUSES = new Map();

// mock endpoints for tests
bedrock.events.on('bedrock-express.configure.routes', app => {
  // get mock VC from mock issuer instance
  app.get(
    '/issuers/1/credentials/:credentialId', asyncHandler(async (req, res) => {
      const {credentialId} = req.params;
      const statusInfo = STATUSES.get(credentialId) ??
        _initStatusInfo({credentialId});
      res.json({
        verifiableCredential: {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',

          ],
          type: ['VerifiableCredential'],
          credentialSubject: {
            name: 'Test'
          },
          credentialStatus: statusInfo.entry
        }
      });
    }));

  // update mock VC status w/mock status instance
  app.post('/statuses/1/credentials/status', asyncHandler(async (req, res) => {
    /*
    {
      credentialId: string,
      indexAllocator: string,
      credentialStatus: {
        type: 'BitstringStatusListEntry',
        statusPurpose: 'revocation',
        statusListCredential: string,
        statusListIndex: string
      },
      status: boolean
    }
    */
    const {credentialId, credentialStatus, status = true} = req.body;
    if(credentialStatus.type !== 'BitstringStatusListEntry') {
      res.status(400).json({
        name: 'DataError',
        message: 'Invalid credential status type.'
      });
      return;
    }
    const statusInfo = STATUSES.get(credentialId) ??
      _initStatusInfo({credentialId});
    statusInfo.status = status;
    res.status(200).end();
  }));
});

function _initStatusInfo({credentialId}) {
  const statusInfo = {
    status: false,
    entry: {
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: STATUSES.size,
      statusListCredential:
        'https://status.example/statuses/1/status-lists/1'
    }
  };
  STATUSES.set(credentialId, statusInfo);
  return statusInfo;
}

import '@bedrock/test';
bedrock.start();
