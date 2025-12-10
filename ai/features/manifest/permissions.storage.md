---
id: manifest.permissions.storage
module: manifest
priority: 54
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
# Permission to use Chrome sync storage for settings

## Acceptance Criteria

1. Permission to use Chrome sync storage for settings works as expected
