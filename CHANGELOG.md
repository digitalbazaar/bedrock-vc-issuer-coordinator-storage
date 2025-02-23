# bedrock-vc-issuer-coordinator-storage ChangeLog

## 1.1.0 - 2025-mm-dd

### Added
- Expose `syncCredentialStatus()` API for syncing the status
  (and, optionally, reference information) of VCs that an
  issuer coordinator references with some set of enumerable
  status updates. The enumerable status updates are returned
  from a function, `getStatusUpdates()`, that the caller of
  `syncCredentialStatus()` provides. See the documentation
  for `syncCredentialStatus()` for more details.

## 1.0.0 - 2024-11-24

### Added
- Added core files.
- See git history for changes.
