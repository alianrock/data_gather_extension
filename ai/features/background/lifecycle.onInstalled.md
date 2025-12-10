---
id: background.lifecycle.onInstalled
module: background
priority: 21
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
# Handle extension installation and update events, open options page on first install

## Acceptance Criteria

1. Handle extension installation and update events, open options page on first install works as expected
