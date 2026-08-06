import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'

import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

import { HydrationScript } from 'solid-js/web'
import { Suspense } from 'solid-js'

import styleCss from '../styles.css?url'

export const Route = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'description', content: 'EV charging gaps map' },
      { title: 'Charge Gaps' },
    ],
    links: [{ rel: 'stylesheet', href: styleCss }],
  }),
  shellComponent: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <Suspense>
          <Outlet />
          <TanStackRouterDevtools />
        </Suspense>
        <Scripts />
      </body>
    </html>
  )
}
