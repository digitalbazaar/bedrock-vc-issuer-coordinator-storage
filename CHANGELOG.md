# bedrock-vc-issuer-coordinator-storage ChangeLog

## 3.3.1 - 2025-10-15

### Fixed
- Fix `@bedrock/app-identity` peer dependency version constraint.

## 3.3.0 - 2025-05-22

### Changed
- Use `@digitalbazaar/lru-memoize@4`. Existing cache defaults and options
  are coerced from previous versions to the new version.

## 3.2.0 - 2025-05-21

### Added
- Add `ignoreCredentialNotFound` option to `syncCredentialStatus()`. See
  the documentation on that method for its use.

## 3.1.1 - 2025-05-07

### Fixed
- Fix typo with `InvalidStatusError` which should have read
  `InvalidStateError`; however, a more error here is `ConstraintError` so it
  is used instead.

## 3.1.0 - 2025-04-25

### Added
- Allow a previously retrieved `reference` object from a VC reference record
  to be specified in a status update object. This is an optimization to support
  sync views that already need to retrieve the `reference` from a record when
  constructing status update objects -- without a need to have `reference`
  retrieved during the subsequent status update. Atomicity of VC reference
  record updates (in the case that `referenceUpdate` is also provided) will
  continue to function properly but an update will obviously only succeed
  (without a conflict error being raised) if the passed `reference` is fresh.

## 3.0.1 - 2025-04-24

### Fixed
- Fix typos in index allocator checks.

## 3.0.0 - 2025-04-14

### Changed
- Update dependencies.
- Update peer dependencies.
  - `@bedrock/core@6.3.0`.
  - **BREAKING**: `@bedrock/mongodb@11`.
    - Use MongoDB driver 6.x and update error names and details.
    - See changelog for details.
- Update dev dependencies.
- Update test dependencies.

## 2.4.0 - 2025-03-19

### Added
- Add `limit` to possible options for `syncCredentialStatus()`.
- Return `hasMore: true|false` signal from `syncCredentialStatus()`.

## 2.3.1 - 2025-03-19

### Fixed
- Ensure VC reference fields are not dropped when a `referenceUpdate` does
  not include all fields.

## 2.3.0 - 2025-03-07

### Added
- Reserve `indexAllocator` property as a special `vcReference` record property
  and use it when updating status, if available. If not available, then the
  `indexAllocator` provided in the status update object will be used, if
  given. If no `indexAllocator` is given, then status for the VC must have
  been previously set or else an error may be thrown by the status service.
  If the status update object provides `indexAllocator` and it does not
  match the existing `vcReference` record `indexAllocator` (if set), then
  an error will be thrown.

## 2.2.0 - 2025-03-07

### Added
- Enable specification of `expand` feature in status update objects provided
  via `getStatusUpdates()`. This feature can be used to (optionally) expand
  status entries prior to attempting to match them against the fields provided
  in the `credentialStatus` value in the status update object. The `credentialStatus` value must minimally provide a `type` and a
  `statusPurpose` to match against an (optionally expanded) status entry from
  the target VC. By default, when the `expand` feature is present, the
  `expand.type` value must match an unexpanded credential status entry in the
  VC or else the update will fail. To make expansion optional such that the
  `credentialStatus` value will still be checked against status entries that
  do not match `expand.type`, set `expand.required = false`. The expand feature
  must also include any required parameters for expansion in `expand.options`
  and may include other optional parameters if desired, e.g.,
  `statusPurpose` and `listLength` are optional parameters for expanding a
  `TerseBitstringStatusList` status entry.

## 2.1.0 - 2025-03-06

### Added
- Add `utils.expandCredentialStatus()` utility for expanding
  `TerseBitstringStatusList` credential status entries.

## 2.0.1 - 2025-03-04

### Fixed
- Use `result.modifiedCount` to enable newer mongodb driver.
- Remove unused `background` option from mongodb index creation.

## 2.0.0 - 2025-03-02

### Added
- Expose `syncCredentialStatus()` API for syncing the status (and, optionally,
  reference information) of VCs that an issuer coordinator references with
  some set of enumerable status updates. The enumerable status updates are
  returned from a function, `getStatusUpdates()`, that the caller of
  `syncCredentialStatus()` provides. See the documentation for
  `syncCredentialStatus()` for more details.
- Add `tasks` API for storing, retrieving, and deleting arbitrary issuer
  coordinator tasks. An application can be configured to optionally encrypt
  all secrets in the task records and/or to set expiration dates for the
  task records for increased security.

### Changed
- **BREAKING**: Changed `vc-reference` collection name to
  `vc-issuer-coordinator-vc-reference` to better namespace the collection in
  the event that it is shared with a wider set of collections in a top-level
  application.
- **BREAKING**: Fix return value of `vcReferences.find()` to be an array of
  found records such that it matches the function documentation.

## 1.0.0 - 2024-11-24

### Added
- Added core files.
- See git history for changes.
