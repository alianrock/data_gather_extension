---
id: background.ai.anthropicIntegration
module: background
priority: 26
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
# Call Anthropic Claude API with x-api-key authentication

## Acceptance Criteria

1. Call Anthropic Claude API with x-api-key authentication works as expected
