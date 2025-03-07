# bedrock-vc-issuer-coordinator-storage ChangeLog

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
