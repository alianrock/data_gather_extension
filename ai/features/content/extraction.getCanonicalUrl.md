---
id: content.extraction.getCanonicalUrl
module: content
priority: 36
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
# Extract canonical URL from link[rel=canonical] element

## Acceptance Criteria

1. Extract canonical URL from link[rel=canonical] element works as expected
