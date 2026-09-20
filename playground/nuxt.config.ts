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
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
      basicAuth: { type: 'http', scheme: 'basic' },
      apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      // apiKey can also live in query or cookies:
      // sessionCookie: { type: 'apiKey', in: 'cookie', name: 'session' },
      oauth2: {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://example.com/oauth/authorize',
            tokenUrl: 'https://example.com/oauth/token',
            scopes: { read: 'Read access', write: 'Write access' },
          },
        },
      },
      oidc: {
        type: 'openIdConnect',
        openIdConnectUrl: 'https://example.com/.well-known/openid-configuration',
      },
    },
    security: ['bearerAuth'],
  },
})
