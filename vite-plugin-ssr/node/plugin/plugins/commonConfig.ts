export { commonConfig }

import type { Plugin, ResolvedConfig } from 'vite'
import { assertRollupInput } from './buildConfig'

function commonConfig(): Plugin[] {
  return [
    {
      name: 'vite-plugin-ssr:commonConfig-1',
      config: () => ({
        appType: 'custom',
        ssr: {
          external: ['vite-plugin-ssr', 'vite-plugin-ssr/server']
        }
      })
    },
    {
      name: 'vite-plugin-ssr:commonConfig-2',
      enforce: 'post',
      configResolved: {
        order: 'post',
        handler(config) {
          setDefaultPort(config)
          workaroundCI(config)
          assertRollupInput(config)
        }
      }
    }
  ]
}

function setDefaultPort(config: ResolvedConfig) {
  // @ts-ignore
  config.server ??= {}
  config.server.port ??= 3000
  // @ts-ignore
  config.preview ??= {}
  config.preview.port ??= 3000
}

// Workaround GitHub Action failing to access the server
function workaroundCI(config: ResolvedConfig) {
  if (process.env.CI) {
    config.server.host ??= true
    config.preview.host ??= true
  }
}
