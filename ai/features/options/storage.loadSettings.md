---
id: options.storage.loadSettings
module: options
priority: 43
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
    pattern: tests/options/**/*.test.*
---
# Load saved settings from Chrome sync storage with defaults

## Acceptance Criteria

1. Load saved settings from Chrome sync storage with defaults works as expected
