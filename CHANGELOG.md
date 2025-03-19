# bedrock-vc-issuer-coordinator-storage ChangeLog

## 2.4.0 - 2025-03-dd

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
