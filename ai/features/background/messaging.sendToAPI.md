---
id: background.messaging.sendToAPI
module: background
priority: 23
status: failing
version: 1
origin: init-auto
dependsOn: []
supersedes: []
tags:
  - code
testRequirements:
  unit:
    required: false
    pattern: tests/background/**/*.test.*
---
# Handle data sending requests from popup via message passing

## Acceptance Criteria

1. Handle data sending requests from popup via message passing works as expected
