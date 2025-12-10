---
id: content.extraction.extractLinks
module: content
priority: 40
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
    pattern: tests/content/**/*.test.*
---
# Extract unique links with URL, text, and isExternal flag (up to 20)

## Acceptance Criteria

1. Extract unique links with URL, text, and isExternal flag (up to 20) works as expected
