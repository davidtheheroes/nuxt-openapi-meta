export default defineNuxtConfig({
  modules: ['nuxt-openapi-meta'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  nitro: {
    experimental: {
      openAPI: true,
    },
    openAPI: {
      production: 'prerender',
    },
  },
  openapiMeta: {
    tagMap: {
      '/api/auth': 'Auth',
      '/api/users': 'Users',
      '/api/roles': 'Roles',
    },
  },
})
