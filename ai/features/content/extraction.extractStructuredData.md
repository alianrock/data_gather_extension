---
id: content.extraction.extractStructuredData
module: content
priority: 41
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
# Parse JSON-LD structured data from script[type=application/ld+json] elements

## Acceptance Criteria

1. Parse JSON-LD structured data from script[type=application/ld+json] elements works as expected
