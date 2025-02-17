/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {config} from '@bedrock/core';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import '@bedrock/express';
import '@bedrock/https-agent';
import '@bedrock/mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config.mocha.tests.push(path.join(__dirname, 'mocha'));

// express info
config.express.session.secret = 'NOTASECRET';
config.express.session.key = 'bedrock-vc-issuer-coordinator-storage.sid';
config.express.session.prefix = 'bedrock-vc-issuer-coordinator-storage.';

// disable sessions server wide
config.express.useSession = false;

// allow self-signed certificates in dev
config['https-agent'].rejectUnauthorized = false;

// mongodb config
config.mongodb.name = 'bedrock_vc_issuer_coordinator_storage_test';
config.mongodb.host = 'localhost';
config.mongodb.port = 27017;
// drop all collections on initialization
config.mongodb.dropCollections = {};
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];
