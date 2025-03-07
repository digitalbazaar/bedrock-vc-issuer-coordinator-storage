/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import './config.js';

export * from './sync.js';
export * as syncRecords from './syncRecords.js';
export * as tasks from './tasks.js';
export * as vcReferences from './vcReferences.js';
export {zcapClient} from './zcapClient.js';

// export specific utilities
import {expandCredentialStatus} from './util.js';
export const utils = {expandCredentialStatus};
