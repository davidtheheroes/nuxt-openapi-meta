/**
 * @summary Hello from server/routes
 * @description Plain (non-/api) route. Proves server/routes is scanned too.
 * @response 200 { "hello": "world" }
 */
export default defineEventHandler(() => {
  return { hello: 'world' }
})
