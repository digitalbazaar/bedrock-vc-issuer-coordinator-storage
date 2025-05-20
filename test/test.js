/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {asyncHandler} from '@bedrock/express';
import '@bedrock/vc-issuer-coordinator-storage';

const {util: {BedrockError}} = bedrock;

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
      if(credentialId.startsWith('urn:special:not-found:')) {
        throw new BedrockError('Credential not found.', {
          name: 'NotFoundError',
          details: {
            httpStatusCode: 404,
            public: true
          }
        });
      }
      res.json({
        verifiableCredential: {
          '@context': [
            'https://www.w3.org/ns/credentials/v2'
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
    const {
      credentialId, credentialStatus, indexAllocator, status = true
    } = req.body;
    // type MUST NOT be `TerseBitstringStatusListEntry` at this point
    if(credentialStatus.type !== 'BitstringStatusListEntry') {
      res.status(400).json({
        name: 'DataError',
        message: 'Invalid credential status type.'
      });
      return;
    }
    const statusInfo = STATUSES.get(credentialId) ??
      _initStatusInfo({credentialId});
    if(indexAllocator === undefined) {
      if(statusInfo.indexAllocator === undefined) {
        res.status(400).json({
          name: 'DataError',
          message: 'Index allocator not set yet; it must be provided.'
        });
        return;
      }
    } else if(statusInfo.indexAllocator === undefined) {
      // set index allocator
      statusInfo.indexAllocator = indexAllocator;
    } else if(indexAllocator !== statusInfo.indexAllocator) {
      // `indexAllocator` must match since it was provided
      res.status(400).json({
        name: 'DataError',
        message: 'Index allocator mismatch.'
      });
      return;
    }
    statusInfo.status = status;
    res.status(200).end();
  }));
});

function _initStatusInfo({credentialId}) {
  const statusInfo = {
    status: false,
    entry: null,
    indexAllocator: undefined
  };
  if(credentialId.endsWith(':terse')) {
    statusInfo.entry = {
      type: 'TerseBitstringStatusListEntry',
      terseStatusListIndex: STATUSES.size,
      terseStatusListBaseUrl:
        'https://status.example/statuses/1/status-lists'
    };
  } else {
    statusInfo.entry = {
      type: 'BitstringStatusListEntry',
      statusPurpose: 'revocation',
      statusListIndex: STATUSES.size,
      statusListCredential:
        'https://status.example/statuses/1/status-lists/1'
    };
  }
  STATUSES.set(credentialId, statusInfo);
  return statusInfo;
}

import '@bedrock/test';
bedrock.start();
