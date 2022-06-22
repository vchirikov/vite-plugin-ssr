export { testRun }

import {
  page,
  run,
  partRegex,
  autoRetry,
  fetchHtml,
  urlBase,
  expectBrowserError,
  editFile,
  editFileRevert,
} from '../libframe/test/setup'
import assert from 'assert'

function testRun(
  cmd: 'npm run dev' | 'npm run prod' | 'pnpm run dev' | 'pnpm run prod',
  {
    skipCssTest,
    noDefaultPageInUserCode,
    isPrerendered,
    uiFramewok,
    lang,
  }: {
    skipCssTest?: boolean
    noDefaultPageInUserCode?: true
    isPrerendered?: true
    uiFramewok: 'react' | 'vue' | 'preact'
    lang?: 'ts'
  },
) {
  run(cmd)

  if (uiFramewok === 'preact' && cmd.endsWith('prod')) {
    // https://github.com/preactjs/preact/issues/3558
    const msg = 'SKIPPED preact prod until it supports Vite 3.'
    console.log(msg)
    test(msg, () => {})
    return
  }

  const isProduction = cmd === 'npm run prod' || cmd === 'pnpm run prod'
  const isDev = !isProduction

  test('page content is rendered to HTML', async () => {
    const html = await fetchHtml('/')
    expect(html).toContain('<h1>Welcome</h1>')
    // Vue injects: `!--[-->Home<!--]-->`
    expect(html).toMatch(partRegex`<a ${/[^\>]+/}>${/.*/}Home${/.*/}</a>`)
    expect(html).toMatch(partRegex`<a ${/[^\>]+/}>${/.*/}About${/.*/}</a>`)
  })

  test('production asset preloading', async () => {
    const html = await fetchHtml('/')

    {
      expect(html).not.toContain('<script type="module" src="/@vite/client"></script>')
      if (!isProduction) {
        expect(html).toContain('import("/@vite/client");')
      } else {
        expect(html).not.toContain('/@vite/client')
      }
    }

    if (isProduction) {
      const hashRegexp = /[a-z0-9]+/
      expect(html).toMatch(partRegex`<link rel="icon" href="/assets/logo.${hashRegexp}.svg" />`)
      expect(html).toMatch(
        partRegex`<link rel="preload" href="/assets/logo.${hashRegexp}.svg" as="image" type="image/svg+xml">`,
      )

      try {
        expect(html).toMatch(
          partRegex`<script type="module" src="/assets/entry-client-routing.${hashRegexp}.js" async>`,
        )
        expect(html).toMatch(
          partRegex`<link rel="modulepreload" as="script" type="text/javascript" href="/assets/entry-client-routing.${hashRegexp}.js">`,
        )
      } catch (err) {
        expect(html).toMatch(
          partRegex`<script type="module" src="/assets/entry-server-routing.${hashRegexp}.js" async>`,
        )
        expect(html).toMatch(
          partRegex`<link rel="modulepreload" as="script" type="text/javascript" href="/assets/entry-server-routing.${hashRegexp}.js">`,
        )
      }

      expect(html).toMatch(
        partRegex`<link rel="modulepreload" as="script" type="text/javascript" href="/assets/chunk-${hashRegexp}.js">`,
      )
      expect(html).toMatch(
        partRegex`<link rel="modulepreload" as="script" type="text/javascript" href="/assets/index.page.${hashRegexp}.js">`,
      )
      if (!noDefaultPageInUserCode) {
        try {
          expect(html).toMatch(
            partRegex`<link rel="stylesheet" type="text/css" href="/assets/PageShell.${hashRegexp}.css">`,
          )
        } catch (err) {
          expect(html).toMatch(
            partRegex`<link rel="stylesheet" type="text/css" href="/assets/_default.page.client.${hashRegexp}.css">`,
          )
        }
        expect(html).toMatch(
          partRegex`<link rel="modulepreload" as="script" type="text/javascript" href="/assets/_default.page.client.${hashRegexp}.js">`,
        )
      }
    }
  })

  test('page is rendered to the DOM and interactive', async () => {
    await page.goto(urlBase + '/')
    expect(await page.textContent('h1')).toBe('Welcome')
    expect(await page.textContent('button')).toBe('Counter 0')
    // `autoRetry` because browser-side code may not be loaded yet
    await autoRetry(async () => {
      await page.click('button')
      expect(await page.textContent('button')).toContain('Counter 1')
    })
  })

  if (isDev && (uiFramewok === 'react' || uiFramewok === 'vue')) {
    test('HMR', async () => {
      const file = (() => {
        if (uiFramewok === 'vue') {
          return './pages/index/index.page.vue'
        }
        if (uiFramewok === 'react') {
          if (lang === 'ts') {
            return './pages/index/index.page.tsx'
          } else {
            return './pages/index/index.page.jsx'
          }
        }
        assert(false)
      })()
      expect(await page.textContent('button')).toContain('Counter 1')
      expect(await page.textContent('h1')).toBe('Welcome')
      editFile(file, (s) => s.replace('Welcome', 'Welcome !'))
      await autoRetry(async () => {
        expect(await page.textContent('h1')).toBe('Welcome !')
      })
      editFileRevert()
      expect(await page.textContent('button')).toContain('Counter 1')
    })
  }

  test('about page', async () => {
    await page.click('a[href="/about"]')
    await autoRetry(async () => {
      const title = await page.textContent('h1')
      expect(title).toBe('About')
    })
    // CSS is loaded only after being dynamically `import()`'d from JS
    await autoRetry(async () => {
      if (skipCssTest) {
        return
      }
      expect(await page.$eval('code', (e) => getComputedStyle(e).backgroundColor)).toBe('rgb(234, 234, 234)')
    })
  })

  test('active links', async () => {
    // Not sure why `autoRetry()` is needed here; isn't the CSS loading already awaited for in the previous `test()` call?
    await autoRetry(async () => {
      expect(await page.$eval('a[href="/about"]', (e) => getComputedStyle(e).backgroundColor)).toBe(
        'rgb(238, 238, 238)',
      )
      expect(await page.$eval('a[href="/"]', (e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    })
  })

  if (!isPrerendered) {
    test('error page', async () => {
      await page.goto(urlBase + '/does-not-exist')
      expect(await page.textContent('h1')).toBe('404 Page Not Found')
      expect(await page.textContent('p')).toBe('This page could not be found.')
      expectBrowserError(
        (browserLog) =>
          partRegex`http://${/[^\/]+/}:3000/does-not-exist`.test(browserLog.logText) &&
          browserLog.logText.includes('Failed to load resource: the server responded with a status of 404 (Not Found)'),
      )
    })
  }
}
