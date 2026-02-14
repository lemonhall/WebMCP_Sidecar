import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('phase0: refresh tools and call searchFlights', async () => {
  const extensionPath = path.resolve(__dirname, '..', '..', 'extension')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wmcp-sidecar-'))

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
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

    await panelPage.getByRole('button', { name: 'Refresh' }).click()
    await expect(panelPage.locator('#status')).toContainText('tools=')

    const toolCount = await panelPage.locator('#tools option').count()
    expect(toolCount).toBeGreaterThan(0)

    await panelPage.selectOption('#tools', { value: 'searchFlights' })
    await panelPage.fill(
      '#params',
      JSON.stringify(
        {
          origin: 'LON',
          destination: 'NYC',
          tripType: 'round-trip',
          outboundDate: '2030-02-14',
          inboundDate: '2030-02-21',
          passengers: 2,
        },
        null,
        0
      )
    )

    await panelPage.getByRole('button', { name: 'Call' }).click()

    await expect
      .poll(async () => {
        const txt = (await panelPage.locator('#result').innerText()).trim()
        if (!txt) return null
        try {
          return JSON.parse(txt)
        } catch {
          return null
        }
      })
      .toMatchObject({ ok: true })

    // Give humans time to see the result in the Side Panel.
    await panelPage.waitForTimeout(3000)
  } finally {
    await context.close()
  }
})
