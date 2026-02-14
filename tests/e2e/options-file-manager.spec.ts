import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('options: file manager can create/open/edit .agents file', async () => {
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

    const optionsPage = await context.newPage()
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'domcontentloaded' })

    await optionsPage.getByRole('button', { name: 'Files' }).click()
    await expect(optionsPage.locator('#fmStatus')).toContainText('idle', { timeout: 30_000 })

    const filePath = `.agents/skills/e2e-skill/SKILL.md`
    await optionsPage.locator('#fmPath').fill(filePath)
    await optionsPage.getByRole('button', { name: 'New File' }).click()

    await expect(optionsPage.locator('#fmOpenPath')).toContainText(filePath, { timeout: 30_000 })

    const content = [
      '---',
      'name: e2e-skill',
      'description: Use when running E2E for file manager.',
      '---',
      '',
      '# E2E Skill',
      'ok',
      '',
    ].join('\n')

    await optionsPage.locator('#fmEditor').fill(content)
    await optionsPage.getByRole('button', { name: 'Save' }).click()
    await expect(optionsPage.locator('#fmStatus')).toContainText('saved', { timeout: 30_000 })

    // Re-open and assert content persisted.
    await optionsPage.locator('#fmEditor').fill('') // clear
    await optionsPage.getByRole('button', { name: 'Open' }).click()
    await expect(optionsPage.locator('#fmOpenPath')).toContainText(filePath, { timeout: 30_000 })
    await expect(optionsPage.locator('#fmEditor')).toHaveValue(/# E2E Skill/, { timeout: 30_000 })
  } finally {
    await context.close()
  }
})
