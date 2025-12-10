---
id: popup.share.socialMedia
module: popup
priority: 3
status: passing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
verification:
  verifiedAt: '2025-12-10T03:56:28.322Z'
  verdict: pass
  verifiedBy: claude
  commitHash: ccda8de72cc56b55c76055a76d0cc5c9c0c4c05a
  summary: 0/0 criteria satisfied
tddGuidance:
  generatedAt: '2025-12-10T03:54:06.419Z'
  generatedBy: claude
  forVersion: 1
  suggestedTestFiles:
    unit:
      - tests/popup/share.socialMedia.test.ts
    e2e:
      - e2e/popup/share.socialMedia.spec.ts
  unitTestCases:
    - name: should generate correct WeChat share URL with page title and URL
      assertions:
        - 'expect(generateWeChatShareUrl(pageInfo)).toContain(''weixin://'')'
        - expect(shareUrl).toContain(encodeURIComponent(pageInfo.url))
    - name: should generate correct Weibo share URL with title and description
      assertions:
        - >-
          expect(generateWeiboShareUrl(pageInfo)).toContain('service.weibo.com/share')
        - expect(shareUrl).toContain(encodeURIComponent(pageInfo.title))
    - name: should generate correct Twitter/X share URL with text and URL
      assertions:
        - >-
          expect(generateTwitterShareUrl(pageInfo)).toContain('twitter.com/intent/tweet')
        - expect(shareUrl).toContain('text=')
        - expect(shareUrl).toContain('url=')
    - name: should handle special characters in page title for share URLs
      assertions:
        - >-
          expect(generateShareUrl({ title: 'Test & <script>'
          })).not.toContain('<script>')
        - expect(shareUrl).toContain(encodeURIComponent('&'))
    - name: should open share URL in new window with correct dimensions
      assertions:
        - >-
          expect(window.open).toHaveBeenCalledWith(expect.any(String), '_blank',
          expect.stringContaining('width='))
        - expect(openShareWindow).toHaveBeenCalledTimes(1)
    - name: should copy WeChat share content to clipboard when WeChat selected
      assertions:
        - >-
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining(pageInfo.url))
        - expect(copyResult.success).toBe(true)
  e2eScenarios:
    - name: user shares page to Twitter via share button
      steps:
        - open popup on a test page
        - click share dropdown button
        - select Twitter option
        - verify new window opens with Twitter intent URL
    - name: user shares page to Weibo via share button
      steps:
        - open popup on a test page
        - click share dropdown button
        - select Weibo option
        - verify new window opens with Weibo share URL containing page info
    - name: user copies WeChat share content
      steps:
        - open popup on a test page
        - click share dropdown button
        - select WeChat option
        - verify clipboard contains share content
        - verify success toast message appears
    - name: share dropdown displays all social media options
      steps:
        - open popup
        - click share button
        - verify WeChat option is visible
        - verify Weibo option is visible
        - verify Twitter option is visible
  frameworkHint: vitest
---
# 添加分享到社媒功能 - 支持分享到微信、微博、Twitter等社交媒体平台
