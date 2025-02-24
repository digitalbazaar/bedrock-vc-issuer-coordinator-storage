/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as database from '@bedrock/mongodb';
import {
  syncRecords, tasks, vcReferences
} from '@bedrock/vc-issuer-coordinator-storage';

export async function cleanDatabase() {
  await database.collections[syncRecords.COLLECTION_NAME].deleteMany({});
  await database.collections[tasks.COLLECTION_NAME].deleteMany({});
  await database.collections[vcReferences.COLLECTION_NAME].deleteMany({});
}

export async function insertRecord({record, collectionName}) {
  const collection = database.collections[collectionName];
  await collection.insertOne(record);
}
