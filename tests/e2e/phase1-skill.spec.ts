import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startMockOpenAIResponsesServer } from './mockOpenAIResponsesServer'

const STORAGE_SETTINGS_KEY = 'settings.llm.v1'

test('phase1: Skill tool loads hello-world from OPFS', async () => {
  const mock = await startMockOpenAIResponsesServer({ script: 'skill-hello' })
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

    await expect(panelPage.locator('#chatStatus')).toContainText('idle')
    await panelPage.locator('#chatInput').fill('请加载 Skill：hello-world，然后回答“已加载”。')
    await panelPage.getByRole('button', { name: 'Send' }).click()

    const chatText = panelPage.locator('#chatMessages')
    await expect(chatText).toContainText('tool.use: Skill', { timeout: 30_000 })
    await expect(chatText).toContainText('## Skill: hello-world', { timeout: 30_000 })
    await expect(chatText).toContainText('已完成：Skill 已加载', { timeout: 30_000 })
  } finally {
    await context.close()
    await mock.close()
  }
})
