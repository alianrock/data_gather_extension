---
id: manifest.permissions.scripting
module: manifest
priority: 53
status: failing
version: 1
origin: init-auto
dependsOn: []
supersedes: []
tags:
  - config
testRequirements:
  unit:
    required: false
    pattern: tests/manifest/**/*.test.*
---
# Permission to inject and execute scripts in webpages

## Acceptance Criteria

1. Permission to inject and execute scripts in webpages works as expected
