export { getHook }
export { assertHook }
export type { Hook }

import { PageContextExports } from './getPageFiles'
import { assert, assertUsage, isCallable } from './utils'

type Hook = { hook: (arg: unknown) => unknown; hookSrc: string }

function getHook(
  pageContext: PageContextExports,
  hookName: 'render' | 'onBeforeRender' | 'onBeforePrerender' | 'onBeforeRoute' | 'onRenderHtml' | 'onRenderClient'
): null | Hook {
  if (!(hookName in pageContext.exports)) {
    return null
  }
  const hook = pageContext.exports[hookName]
  const file = pageContext.exportsAll[hookName]![0]!
  assert(file.exportValue === hook)
  const hookSrc = file.exportSource
  assert(hookSrc)
  assert(!hookName.endsWith(')'))
  assertUsage(isCallable(hook), `hook ${hookName}() defined by ${hookSrc} should be a function`)
  return { hook, hookSrc }
}

function assertHook<PC extends PageContextExports, HookName extends PropertyKey>(
  pageContext: PC,
  hookName: HookName
): asserts pageContext is PC & { exports: Record<HookName, Function | undefined> } {
  getHook(pageContext, hookName as any)
}
