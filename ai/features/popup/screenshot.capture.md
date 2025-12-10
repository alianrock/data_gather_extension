---
id: popup.screenshot.capture
module: popup
priority: 12
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
    pattern: tests/popup/**/*.test.*
---
# Capture visible tab screenshot as PNG using Chrome tabs API

## Acceptance Criteria

1. Capture visible tab screenshot as PNG using Chrome tabs API works as expected
