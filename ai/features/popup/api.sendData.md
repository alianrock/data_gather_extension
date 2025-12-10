---
id: popup.api.sendData
module: popup
priority: 14
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
    pattern: tests/popup/**/*.test.*
---
# Send collected data (page info, screenshot, summary) to configured external API endpoint

## Acceptance Criteria

1. Send collected data (page info, screenshot, summary) to configured external API endpoint works as expected
