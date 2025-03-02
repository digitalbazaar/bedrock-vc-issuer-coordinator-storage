/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as helpers from './helpers.js';
import {tasks} from '@bedrock/vc-issuer-coordinator-storage';

// import is for testing purposes only; not a public export
import {_loadKeys} from
  '@bedrock/vc-issuer-coordinator-storage/lib/taskEncryption.js';

describe('Tasks API', function() {
  const taskEncryption = [
    /*{
      title: 'w/no encryption',
      hmacKey: null,
      kek: null
    },*/
    {
      title: 'w/aes256 encryption',
      hmacKey: {
        id: 'urn:test:hmacKey',
        secretKeyMultibase: 'uogHy02QDNPX4GID7dGUSGuYQ_Gv0WOIcpmTuKgt1ZNz7_4'
      },
      kek: {
        id: 'urn:test:kek',
        secretKeyMultibase: 'uogHJrlqLtq1bUzjn-TVqdxwZnQZFeADOn9n9mtjLQldjXE'
      }
    }
  ];
  for(const encryptConfig of taskEncryption) {
    describe(encryptConfig.title, () => {
      before(() => {
        const cfg = bedrock.config['vc-issuer-coordinator-storage'];
        cfg.tasks.recordEncryption = {
          hmacKey: encryptConfig.hmacKey,
          kek: encryptConfig.kek
        };
        _loadKeys();
      });
      after(() => {
        const cfg = bedrock.config['vc-issuer-coordinator-storage'];
        cfg.tasks.recordEncryption = {hmacKey: null, kek: null};
        _loadKeys();
      });
      beforeEach(async () => {
        await helpers.cleanDatabase();
      });

      it('creates a task', async () => {
        let err;
        let result;
        try {
          result = await tasks.create({
            request: {
              a: 1,
              b: 2
            }
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        should.exist(result);
        result.should.include.keys(['task', 'meta']);
        result.task.request.should.deep.equal({a: 1, b: 2});
      });

      it('create fails w/"DuplicateError" for the same request', async () => {
        const request = {a: 1, b: 2};
        await tasks.create({request});

        let err;
        let result;
        try {
          result = await tasks.create({
            request: structuredClone(request)
          });
        } catch(e) {
          err = e;
        }
        should.not.exist(result);
        should.exist(err);
        err.name.should.equal('DuplicateError');
      });

      it('creates two different tasks with different requests', async () => {
        const request = {a: 1, b: 2};
        await tasks.create({request});

        const differentRequest = structuredClone(request);
        differentRequest.a = 2;
        let err;
        let result;
        try {
          result = await tasks.create({request: differentRequest});
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        should.exist(result);
        result.should.include.keys(['task', 'meta']);
        result.task.request.should.deep.equal(differentRequest);
      });

      it('gets a "NotFoundError" for a non-existent task', async () => {
        let err;
        let result;
        try {
          result = await tasks.get({
            request: {
              a: 1,
              b: 2
            }
          });
        } catch(e) {
          err = e;
        }
        should.not.exist(result);
        should.exist(err);
        err.name.should.equal('NotFoundError');
      });

      it('gets a task by "id"', async () => {
        let id;
        {
          const record = await tasks.create({
            request: {
              a: 1,
              b: 2
            }
          });
          id = record.task.id;
        }

        let err;
        let result;
        try {
          result = await tasks.get({id});
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        should.exist(result);
        result.should.include.keys(['task', 'meta']);
        result.task.request.should.deep.equal({a: 1, b: 2});
      });

      it('gets a task by "request"', async () => {
        await tasks.create({
          request: {
            a: 1,
            b: 2
          }
        });

        let err;
        let result;
        try {
          result = await tasks.get({
            request: {
              a: 1,
              b: 2
            }
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        should.exist(result);
        result.should.include.keys(['task', 'meta']);
        result.task.request.should.deep.equal({a: 1, b: 2});
      });

      it('finds a task by "id"', async () => {
        let id;
        {
          const record = await tasks.create({
            request: {
              a: 1,
              b: 2
            }
          });
          id = record.task.id;
        }

        let err;
        let result;
        try {
          result = await tasks.find({
            query: {
              'task.id': id
            },
            options: {
              limit: 1
            }
          });
        } catch(e) {
          err = e;
        }
        assertNoError(err);
        should.exist(result);
        result.should.be.an('array');
        result.length.should.equal(1);
        result[0].should.include.keys(['task', 'meta']);
        result[0].task.request.should.deep.equal({a: 1, b: 2});
      });

      it('deletes a task by "id"', async () => {
        let id;
        {
          const record = await tasks.create({
            request: {
              a: 1,
              b: 2
            }
          });
          id = record.task.id;
        }

        {
          const result = await tasks.get({id});
          should.exist(result);
        }

        await tasks.remove({id});

        let err;
        let result;
        try {
          result = await tasks.get({id});
        } catch(e) {
          err = e;
        }
        should.not.exist(result);
        should.exist(err);
        err.name.should.equal('NotFoundError');
      });

      it('deletes a task by "request"', async () => {
        await tasks.create({
          request: {
            a: 1,
            b: 2
          }
        });

        {
          const result = await tasks.get({
            request: {
              a: 1,
              b: 2
            }
          });
          should.exist(result);
        }

        await tasks.remove({
          request: {
            a: 1,
            b: 2
          }
        });

        let err;
        let result;
        try {
          result = await tasks.get({
            request: {
              a: 1,
              b: 2
            }
          });
        } catch(e) {
          err = e;
        }
        should.not.exist(result);
        should.exist(err);
        err.name.should.equal('NotFoundError');
      });
    });
  }

  describe('Indexes', function() {
    const records = [];
    beforeEach(async () => {
      await helpers.cleanDatabase();

      // insert records in order to do proper assertions for
      // 'nReturned', 'totalKeysExamined' and 'totalDocsExamined'.
      records.push(await tasks.create({
        request: {a: 1, b: 2}
      }));
      records.push(await tasks.create({
        request: {a: 2, b: 3}
      }));
    });
    it('is properly indexed for query of ' +
      `'task.id' in get()`, async function() {
      const id = records[0].task.id;
      const {executionStats} = await tasks.get({id, explain: true});
      executionStats.nReturned.should.equal(1);
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
      executionStats.executionStages.inputStage.inputStage.inputStage.stage
        .should.equal('IXSCAN');
      executionStats.executionStages.inputStage.inputStage.inputStage
        .keyPattern.should.eql({'task.id': 1});
    });
    it('is properly indexed for query of ' +
      `'meta.created' in find()`, async function() {
      const created = records[0].meta.created;
      const {executionStats} = await tasks.find({
        query: {
          'meta.created': {$gte: created}
        },
        explain: true
      });
      executionStats.nReturned.should.equal(2);
      executionStats.totalKeysExamined.should.equal(2);
      executionStats.totalDocsExamined.should.equal(2);
      executionStats.executionStages.inputStage.stage
        .should.equal('IXSCAN');
      executionStats.executionStages.inputStage
        .keyPattern.should.eql({'meta.created': 1});
    });
  });
});
