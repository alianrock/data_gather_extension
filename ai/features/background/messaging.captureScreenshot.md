---
id: background.messaging.captureScreenshot
module: background
priority: 22
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
# Handle screenshot capture requests from popup via message passing

## Acceptance Criteria

1. Handle screenshot capture requests from popup via message passing works as expected
