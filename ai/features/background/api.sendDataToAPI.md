---
id: background.api.sendDataToAPI
module: background
priority: 28
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
# Send collected data to configured external API with optional Bearer authentication

## Acceptance Criteria

1. Send collected data to configured external API with optional Bearer authentication works as expected
