/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {cleanDB, insertRecord} from './helpers.js';
import {mockRecord1, mockRecord2} from './mock.data.js';
import crypto from 'node:crypto';
import {vcReferences} from '@bedrock/vc-issuer-coordinator-storage';

describe('VC References', function() {
  describe('insert()', () => {
    it('should insert a record', async () => {
      const credentialId = crypto.randomUUID();
      const record1 = await vcReferences.insert({
        reference: {
          credentialId,
          sequence: 0
        }
      });
      const record2 = await vcReferences.get({credentialId});
      record1.should.eql(record2);
      // should fetch the same record again after clearing the in-memory cache
      vcReferences._CACHE.cache.reset();
      const record3 = await vcReferences.get({credentialId});
      record2.should.eql(record3);
    });

    it('should insert a record', async () => {
      const credentialId = crypto.randomUUID();
      const record1 = await vcReferences.insert({
        reference: {
          credentialId,
          sequence: 0
        }
      });
      const record2 = await vcReferences.get({credentialId});
      record1.should.eql(record2);
      // should fetch the same record again after clearing the in-memory cache
      vcReferences._CACHE.cache.reset();
      const record3 = await vcReferences.get({credentialId});
      record2.should.eql(record3);
    });

    it('should error when no "reference" is passed', async () => {
      let err;
      try {
        await vcReferences.insert();
      } catch(e) {
        err = e;
      }
      err.message.should.include('reference (object) is required');
    });

    it('should error when no "reference.credentialId" is passed', async () => {
      let err;
      try {
        await vcReferences.insert({
          reference: {}
        });
      } catch(e) {
        err = e;
      }
      err.message.should.include('reference.credentialId (string) is required');
    });

    it('should error when no "reference.sequence" is passed', async () => {
      let err;
      try {
        const credentialId = crypto.randomUUID();
        await vcReferences.insert({
          reference: {
            credentialId
          }
        });
      } catch(e) {
        err = e;
      }
      err.message.should.include('reference.sequence (number) is required');
    });

    it('should error when wrong "sequence" is passed', async () => {
      let err;
      try {
        const credentialId = crypto.randomUUID();
        await vcReferences.insert({
          reference: {
            credentialId,
            sequence: 1
          }
        });
      } catch(e) {
        err = e;
      }
      err.name.should.equal('InvalidStateError');
    });
  });

  describe('get()', () => {
    it('should get a record', async () => {
      const credentialId = crypto.randomUUID();
      const record1 = await vcReferences.insert({
        reference: {
          credentialId,
          sequence: 0
        }
      });
      const record2 = await vcReferences.get({credentialId});
      record1.should.eql(record2);
      // should fetch the same record again after clearing the in-memory cache
      vcReferences._CACHE.cache.reset();
      const record3 = await vcReferences.get({credentialId});
      record2.should.eql(record3);
    });

    it('should error when no "credentialId" is passed', async () => {
      let err;
      try {
        await vcReferences.get();
      } catch(e) {
        err = e;
      }
      err.message.should.include('credentialId (string) is required');
    });

    it('should get not found error', async () => {
      let err;
      try {
        await vcReferences.get({
          credentialId: crypto.randomUUID()
        });
      } catch(e) {
        err = e;
      }
      err.name.should.equal('NotFoundError');
    });
  });

  describe('update()', () => {
    it('should update a record', async () => {
      // clear in-memory cache
      vcReferences._CACHE.cache.reset();

      const credentialId = crypto.randomUUID();
      const record1 = await vcReferences.insert({
        reference: {
          credentialId,
          sequence: 0
        }
      });

      // first fetch should hit database, second in-memory cache
      const record1a = await vcReferences.get({credentialId});
      record1a.should.eql(record1a);
      vcReferences._CACHE.cache.itemCount.should.equal(1);
      const record1b = await vcReferences.get({credentialId});
      record1a.should.eql(record1b);
      // should have reused in-memory cache
      vcReferences._CACHE.cache.itemCount.should.equal(1);

      // now update
      await vcReferences.update({
        reference: {
          credentialId,
          sequence: 1
        }
      });
      // should have cleared in memory cache entry
      vcReferences._CACHE.cache.itemCount.should.equal(0);
      const record2 = await vcReferences.get({credentialId});
      record1.should.not.eql(record2);
      const expectedRecord2 = {
        ...record2,
        reference: {...record1.reference, sequence: 1}
      };
      record2.should.eql(expectedRecord2);
      // should have used in-memory cache with new record
      vcReferences._CACHE.cache.itemCount.should.equal(1);

      // should fetch the same record again after clearing the in-memory cache
      vcReferences._CACHE.cache.reset();
      const record3 = await vcReferences.get({credentialId});
      record2.should.eql(record3);
    });

    it('should error when no "reference" is passed', async () => {
      let err;
      try {
        await vcReferences.update();
      } catch(e) {
        err = e;
      }
      err.message.should.include('reference (object) is required');
    });

    it('should error when no "reference.credentialId" is passed', async () => {
      let err;
      try {
        await vcReferences.update({
          reference: {}
        });
      } catch(e) {
        err = e;
      }
      err.message.should.include('reference.credentialId (string) is required');
    });

    it('should error when no "reference.sequence" is passed', async () => {
      let err;
      try {
        const credentialId = crypto.randomUUID();
        await vcReferences.update({
          reference: {
            credentialId
          }
        });
      } catch(e) {
        err = e;
      }
      err.message.should.include('reference.sequence (number) is required');
    });

    it('should error when wrong "sequence" is passed', async () => {
      let err;
      try {
        const credentialId = crypto.randomUUID();
        await vcReferences.insert({
          reference: {
            credentialId,
            sequence: 0
          }
        });
        await vcReferences.update({
          reference: {
            credentialId,
            sequence: 2
          }
        });
      } catch(e) {
        err = e;
      }
      err.name.should.equal('InvalidStateError');
    });
  });
});

describe('VC Reference Database Tests', function() {
  describe('Indexes', function() {
    beforeEach(async () => {
      const collectionName = 'vc-reference';
      await cleanDB({collectionName});

      await insertRecord({record: mockRecord1, collectionName});
      // second record is inserted here in order to do proper assertions for
      // 'nReturned', 'totalKeysExamined' and 'totalDocsExamined'.
      await insertRecord({record: mockRecord2, collectionName});
    });
    it('is properly indexed for query of ' +
      `'reference.credentialId' in get()`, async function() {
      const {credentialId} = mockRecord1.reference;
      const {executionStats} = await vcReferences.get({
        credentialId, explain: true
      });
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.inputStage.stage
        .should.equal('IXSCAN');
      executionStats.executionStages.inputStage.inputStage.inputStage
        .keyPattern.should.eql({'reference.credentialId': 1});
    });
  });
});
