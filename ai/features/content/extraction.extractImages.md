---
id: content.extraction.extractImages
module: content
priority: 39
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
# Extract image src, alt, width, height filtering small images (up to 10)

## Acceptance Criteria

1. Extract image src, alt, width, height filtering small images (up to 10) works as expected
