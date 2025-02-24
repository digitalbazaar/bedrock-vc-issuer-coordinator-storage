/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as helpers from './helpers.js';
import {tasks} from '@bedrock/vc-issuer-coordinator-storage';

describe('Tasks API', function() {
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
