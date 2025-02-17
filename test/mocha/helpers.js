/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import * as database from '@bedrock/mongodb';
import {vcReferences} from '@bedrock/vc-issuer-coordinator-storage';

export async function cleanDatabase() {
  // FIXME: add sync state collection
  await database.collections[vcReferences.COLLECTION_NAME].deleteMany({});
}

export async function insertRecord({record, collectionName}) {
  const collection = database.collections[collectionName];
  await collection.insertOne(record);
}
