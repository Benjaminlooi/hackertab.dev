import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

// Global msw server — individual tests add handlers via server.use()
export const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
