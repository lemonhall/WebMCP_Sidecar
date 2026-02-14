import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('phase1: asking for skills triggers ListSkills (no LLM required)', async () => {
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

    const panelPage = await context.newPage()
    await panelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: 'domcontentloaded' })

    await panelPage.locator('#chatInput').fill('嗯嗯，你现在有什么可用的技能啊？')
    await panelPage.getByRole('button', { name: 'Send' }).click()

    const chatText = panelPage.locator('#chatMessages')
    await expect(chatText).toContainText('tool.use: ListSkills', { timeout: 30_000 })
    await expect(chatText).toContainText('hello-world', { timeout: 30_000 })
    await expect(chatText).toContainText('deep-research', { timeout: 30_000 })
  } finally {
    await context.close()
  }
})
