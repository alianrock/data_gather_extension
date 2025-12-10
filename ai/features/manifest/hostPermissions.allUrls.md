---
id: manifest.hostPermissions.allUrls
module: manifest
priority: 56
status: failing
version: 1
origin: init-auto
dependsOn: []
supersedes: []
tags:
  - config
testRequirements:
  unit:
    required: false
    pattern: tests/manifest/**/*.test.*
---
# Permission to access all URLs for content script injection

## Acceptance Criteria

1. Permission to access all URLs for content script injection works as expected
