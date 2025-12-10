---
id: bugfix.ai.jsonParseError
module: background
priority: 1
status: passing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
verification:
  verifiedAt: '2025-12-10T03:47:07.679Z'
  verdict: pass
  verifiedBy: claude
  commitHash: 5cd66a88fa29b0032c6068eb0ad723d5f228116a
  summary: 0/0 criteria satisfied
tddGuidance:
  generatedAt: '2025-12-10T03:38:37.913Z'
  generatedBy: claude
  forVersion: 1
  suggestedTestFiles:
    unit:
      - tests/background/ai-summary.test.ts
      - tests/background/json-parsing.test.ts
    e2e: []
  unitTestCases:
    - name: should successfully parse valid JSON response from Anthropic API
      assertions:
        - expect(result).toBeDefined()
        - 'expect(result.content[0].text).toBe(''expected summary'')'
    - name: should handle JSON response with trailing whitespace
      assertions:
        - >-
          expect(() =>
          parseAIResponse(jsonWithTrailingWhitespace)).not.toThrow()
        - expect(result).toEqual(expectedParsedData)
    - name: should handle JSON response with BOM or encoding issues
      assertions:
        - expect(() => parseAIResponse(jsonWithBOM)).not.toThrow()
        - 'expect(result.content[0].text).toBeTruthy()'
    - name: should handle JSON response with extra characters after valid JSON
      assertions:
        - expect(() => parseAIResponse(jsonWithTrailingChars)).not.toThrow()
        - expect(result).toHaveProperty('content')
    - name: >-
        should return AI-generated summary instead of default when parsing
        succeeds
      assertions:
        - expect(summary).not.toContain('使用默认摘要')
        - expect(summary).toBe(mockAISummary)
    - name: >-
        should gracefully fallback to default summary only on genuine API
        failures
      assertions:
        - expect(summary).toContain('生成摘要失败')
        - expect(summary).toContain(pageInfo.title)
    - name: should successfully parse valid JSON response from OpenAI API
      assertions:
        - expect(result).toBeDefined()
        - 'expect(result.choices[0].message.content).toBe(''expected summary'')'
    - name: should sanitize response text before JSON parsing
      assertions:
        - expect(sanitizeResponse).toHaveBeenCalledWith(rawResponse)
        - expect(JSON.parse).toHaveBeenCalledWith(sanitizedResponse)
  e2eScenarios: []
  frameworkHint: vitest
---
# 修复AI接口对接错误生成摘要失败: JSON解析错误 - Unexpected non-whitespace character after JSON at position 4，导致使用默认摘要而非AI生成的摘要
