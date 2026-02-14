import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMockOpenAIResponsesServer } from './mockOpenAIResponsesServer'

const STORAGE_SETTINGS_KEY = 'settings.llm.v1'

test('phase1: chat agent calls tools across navigation', async () => {
  const mock = await startMockOpenAIResponsesServer()
  const extensionPath = path.resolve(__dirname, '..', '..', 'extension')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wmcp-sidecar-'))

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  })

  try {
    let worker = context.serviceWorkers()[0]
    if (!worker) worker = await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host

    const demoPage = await context.newPage()
    await demoPage.goto('https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/', {
      waitUntil: 'domcontentloaded',
    })
    await demoPage.bringToFront()

    const panelPage = await context.newPage()
    await panelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: 'domcontentloaded' })

    // Configure LLM settings directly (avoid UI + keep it deterministic).
    await panelPage.evaluate(
      async ({ key, value }) => {
        // @ts-expect-error chrome is available in extension context
        await chrome.storage.local.set({ [key]: value })
      },
      {
        key: STORAGE_SETTINGS_KEY,
        value: { baseUrl: mock.baseUrl, model: 'mock', apiKey: 'test' },
      }
    )

    // Keep the demo tab as "active" (avoid focusing the panel tab), otherwise
    // chrome.tabs.query({active:true}) in the sidepanel may see the extension URL.
    const prompt =
      '$deep-research 请调用 searchFlights，参数用 {"origin":"LON","destination":"NYC","tripType":"round-trip","outboundDate":"2026-02-14","inboundDate":"2026-02-21","passengers":2}，然后总结结果。'

    await panelPage.evaluate((t) => {
      const el = document.getElementById('chatInput') as HTMLTextAreaElement | null
      if (el) el.value = t
    }, prompt)
    await panelPage.evaluate(() => (document.getElementById('chatSend') as HTMLButtonElement | null)?.click())

    const chatText = panelPage.locator('#chatMessages')
    await expect(chatText).toContainText('Skill directive detected: deep-research', { timeout: 30_000 })
    await expect(chatText).toContainText('tool.use: Skill', { timeout: 30_000 })
    await expect(chatText).toContainText('## Skill: deep-research', { timeout: 30_000 })
    await expect(chatText).toContainText('tool.use: searchFlights', { timeout: 30_000 })
    await expect(chatText).toContainText('Notice: active tab navigated.', { timeout: 30_000 })
    await expect(chatText).toContainText('tool.use: listFlights', { timeout: 30_000 })
    await expect(chatText).toContainText('已完成', { timeout: 30_000 })

    // Markdown should be rendered for assistant/user messages.
    await expect(panelPage.locator('.msg.role-assistant .text.md h2', { hasText: '已完成' }).first()).toBeVisible({
      timeout: 30_000,
    })

    // Ensure we didn't "double call" listFlights due to notice enforcement.
    const listCount = await panelPage.locator('.msg .meta', { hasText: 'tool.use: listFlights' }).count()
    expect(listCount).toBe(1)

    // Big tool results should be truncated in UI.
    await expect(panelPage.locator('.msg .meta', { hasText: 'tool.result (truncated)' }).first()).toBeVisible({
      timeout: 30_000,
    })

    // Copy transcript should work (we assert status text rather than reading clipboard).
    await panelPage.evaluate(() => (document.getElementById('chatCopy') as HTMLButtonElement | null)?.click())
    await expect(panelPage.locator('#chatStatus')).toContainText('copied', { timeout: 10_000 })

    const delayMs = process.env.PW_HUMAN_DELAY_MS ? Number(process.env.PW_HUMAN_DELAY_MS) : process.env.CI ? 0 : 1000
    if (delayMs > 0) await panelPage.waitForTimeout(delayMs)
  } finally {
    await context.close()
    await mock.close()
  }
})
