---
id: popup.card.generateImage
module: popup
priority: 2
status: passing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
verification:
  verifiedAt: '2025-12-10T03:52:56.426Z'
  verdict: pass
  verifiedBy: claude
  commitHash: 9a0fbc6b5bd1bf12ed8ea49ada9b56c1f7927e82
  summary: 0/0 criteria satisfied
tddGuidance:
  generatedAt: '2025-12-10T03:49:06.219Z'
  generatedBy: claude
  forVersion: 1
  suggestedTestFiles:
    unit:
      - tests/popup/card.generateImage.test.js
    e2e:
      - e2e/popup/card.generateImage.spec.js
  unitTestCases:
    - name: should generate canvas with correct dimensions
      assertions:
        - expect(canvas.width).toBe(expectedWidth)
        - expect(canvas.height).toBeGreaterThan(0)
    - name: should render website title on card
      assertions:
        - >-
          expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining(title),
          expect.any(Number), expect.any(Number))
    - name: should render website URL on card
      assertions:
        - >-
          expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining(url),
          expect.any(Number), expect.any(Number))
    - name: should render website description/summary on card
      assertions:
        - expect(ctx.fillText).toHaveBeenCalled()
        - expect(renderedText).toContain(description)
    - name: should embed screenshot image on card
      assertions:
        - expect(ctx.drawImage).toHaveBeenCalled()
        - >-
          expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement),
          expect.any(Number), expect.any(Number), expect.any(Number),
          expect.any(Number))
    - name: should export card as image data URL
      assertions:
        - 'expect(result).toMatch(/^data:image\/(png|jpeg)/)'
        - expect(typeof result).toBe('string')
    - name: should handle missing screenshot gracefully
      assertions:
        - >-
          expect(generateCard({ title, url, summary, screenshot: null
          })).resolves.toBeDefined()
    - name: should handle long text with truncation or wrapping
      assertions:
        - expect(renderedLines.length).toBeLessThanOrEqual(maxLines)
        - expect(truncatedText).toContain('...')
  e2eScenarios:
    - name: user generates shareable card from collected page info
      steps:
        - navigate to popup page
        - wait for page info and screenshot to load
        - click generate card button
        - 'verify card preview appears with title, URL, summary and screenshot'
        - verify download/share options are available
    - name: user downloads generated card image
      steps:
        - generate card from page info
        - click download button
        - verify image file download starts
        - verify downloaded file is valid image format
    - name: user shares generated card to social media
      steps:
        - generate card from page info
        - click share button
        - verify share modal or native share dialog opens
        - verify card image data is included in share payload
  frameworkHint: vitest
---
# 添加卡片生成功能 - 将网站简介、网站截图组合生成一张可分享的卡片图片
