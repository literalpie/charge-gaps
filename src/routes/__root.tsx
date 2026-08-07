import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'

import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'

import { HydrationScript } from 'solid-js/web'
import { Suspense } from 'solid-js'

import styleCss from '../styles.css?url'

const queryClient = new QueryClient()

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
        <QueryClientProvider client={queryClient}>
          <Suspense>
            <Outlet />
          </Suspense>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
