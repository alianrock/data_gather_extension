---
id: background.ai.openaiIntegration
module: background
priority: 25
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
# Call OpenAI-compatible chat completion API with Bearer token authentication

## Acceptance Criteria

1. Call OpenAI-compatible chat completion API with Bearer token authentication works as expected
