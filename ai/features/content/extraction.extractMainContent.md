---
id: content.extraction.extractMainContent
module: content
priority: 37
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
# Extract main text content from page, filtering out scripts, styles, nav, header, footer, aside

## Acceptance Criteria

1. Extract main text content from page, filtering out scripts, styles, nav, header, footer, aside works as expected
