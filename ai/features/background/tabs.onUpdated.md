---
id: background.tabs.onUpdated
module: background
priority: 31
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
# Listen for tab update events (page load complete)

## Acceptance Criteria

1. Listen for tab update events (page load complete) works as expected
