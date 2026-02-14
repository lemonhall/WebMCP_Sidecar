import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { startMockOpenAIResponsesServer } from './mockOpenAIResponsesServer'

const STORAGE_SETTINGS_KEY = 'settings.llm.v1'

function startLocalHttpServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.setHeader('access-control-allow-origin', '*')
      res.end('hello from local server')
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({
        url: `http://127.0.0.1:${port}/hello`,
        close: async () => {
          await new Promise<void>((r) => server.close(() => r()))
        },
      })
    })
  })
}

test('phase1: agent can WebFetch a local URL (allow_private_networks)', async () => {
  const local = await startLocalHttpServer()
  const mock = await startMockOpenAIResponsesServer({ script: 'webfetch', localUrl: local.url })
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

    // Keep an HTTP tab active so the sidepanel can resolve an active tab id/url.
    const demoPage = await context.newPage()
    await demoPage.goto(local.url, { waitUntil: 'domcontentloaded' })
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

    const prompt = `请用 WebFetch 获取这个地址并返回文本：${local.url}`
    await panelPage.evaluate((t) => {
      const el = document.getElementById('chatInput') as HTMLTextAreaElement | null
      if (el) el.value = t
    }, prompt)

    await panelPage.evaluate(() => (document.getElementById('chatSend') as HTMLButtonElement | null)?.click())

    const chatText = panelPage.locator('#chatMessages')
    await expect(chatText).toContainText('tool.use: WebFetch', { timeout: 30_000 })
    // Tool result is rendered as pretty JSON and truncated to keep the UI readable, so don't assert the body text.
    await expect(chatText).toContainText('"status": 200', { timeout: 30_000 })
    await expect(chatText).toContainText('"bytes": 23', { timeout: 30_000 })
    await expect(chatText).toContainText('WebFetch OK', { timeout: 30_000 })
  } finally {
    await context.close()
    await mock.close()
    await local.close()
  }
})
