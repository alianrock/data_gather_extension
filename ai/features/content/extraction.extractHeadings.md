---
id: content.extraction.extractHeadings
module: content
priority: 38
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
# Extract h1-h6 headings with level and text (up to 20)

## Acceptance Criteria

1. Extract h1-h6 headings with level and text (up to 20) works as expected
