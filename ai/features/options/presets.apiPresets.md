---
id: options.presets.apiPresets
module: options
priority: 45
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
# Provide preset API configurations for OpenAI, Anthropic, and custom providers

## Acceptance Criteria

1. Provide preset API configurations for OpenAI, Anthropic, and custom providers works as expected
