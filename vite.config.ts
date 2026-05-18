import vue from '@vitejs/plugin-vue2'
import version from 'vite-plugin-package-version'
import { defineConfig } from 'vite'

import Components from 'unplugin-vue-components/vite'
import { VuetifyResolver } from 'unplugin-vue-components/resolvers'
import { checker } from 'vite-plugin-checker'

import path from 'path'
import buildVersion from './src/plugins/build-version'
import buildReleaseInfo from './src/plugins/build-release_info'
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa'
import postcssNesting from 'postcss-nesting'

const PWAConfig: Partial<VitePWAOptions> = {
    registerType: 'autoUpdate',
    includeAssets: ['fonts/**/*.woff2', 'img/**/*.svg', 'img/**/*.png'],
    manifest: {
        name: 'Mainsail',
        short_name: 'Mainsail',
        description: 'Web interface for Klipper 3D printer firmware',
        theme_color: '#D51F26',
        display: 'standalone',
        start_url: '/',
        background_color: '#121212',
        icons: [
            {
                src: '/img/icons/icon-192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/img/icons/icon-192-maskable.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable',
            },
            {
                src: '/img/icons/icon-512.png',
                sizes: '512x512',
                type: 'image/png',
            },
            {
                src: '/img/icons/icon-512-maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    },
    workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg}'],
        navigateFallbackDenylist: [/^\/(access|api|printer|server|websocket)/, /^\/webcam[2-4]?/],
        // Purge precaches from prior SW versions so old hashed chunks
        // don't co-exist with new ones — the cause of the Vuetify
        // "Multiple instances of Vue detected" warning when a tab
        // straddles a backend redeploy.
        cleanupOutdatedCaches: true,
        // Activate the new SW immediately when it's installed instead
        // of waiting for all clients to close. Pairs with autoUpdate
        // above and ensures users on long-lived tabs pick up new
        // bundles without manually closing every window.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
            {
                urlPattern: /\/config\.json$/,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'config.json',
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
    /* enable sw on development */
    devOptions: {
        enabled: true,
        type: 'module',
        suppressWarnings: true,
    },
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        VitePWA(PWAConfig),
        buildVersion(),
        buildReleaseInfo(),
        vue(),
        version(),
        checker({
            typescript: {
                root: path.resolve(__dirname),
                buildMode: false,
            },
        }),
        Components({
            dts: true, // enabled by default if `typescript` is installed
            resolvers: [VuetifyResolver()],
        }),
    ],

    css: {
        preprocessorOptions: {
            sass: {
                silenceDeprecations: ['import', 'global-builtin', 'slash-div', 'if-function'],
                quietDeps: true,
            },
            scss: {
                silenceDeprecations: ['import', 'global-builtin', 'slash-div', 'if-function'],
                quietDeps: true,
            },
        },
        postcss: {
            plugins: [postcssNesting()],
        },
    },

    build: {
        target: 'safari12',
        rollupOptions: {
            output: {
                manualChunks: (id: string) => {
                    if (id.includes('node_modules')) {
                        // split codemirror into its own chunk
                        if (id.includes('/codemirror/') || id.includes('/@codemirror/')) {
                            return 'codemirror'
                        }

                        // split these libs into their own chunks
                        const chunkedLibs = ['vuetify', 'echarts', 'overlayscrollbars']
                        for (const lib of chunkedLibs) {
                            if (id.includes(`/node_modules/${lib}/`)) {
                                return lib.replace('.js', '')
                            }
                        }
                    }
                },
            },
        },
        commonjsOptions: {
            transformMixedEsModules: true,
        },
    },

    envPrefix: 'VUE_',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            stream: 'stream-browserify',
            events: 'events',
        },
    },

    optimizeDeps: {
        include: ['events'],
        esbuildOptions: {
            define: {
                global: 'globalThis',
            },
        },
    },

    server: {
        host: '0.0.0.0',
        port: 8080,
        // Proxy Moonraker API + WebSocket + go2rtc to the bambu-raker
        // container on Unraid so the SPA can run locally over plain
        // HTTP with no CORS or mixed-content issues. Override the
        // target host with the MAINSAIL_BAMBU_BACKEND env var if your
        // bambu-raker is at a different address.
        //   MAINSAIL_BAMBU_BACKEND=http://192.168.1.50:7125 npm run serve
        // The go2rtc/webcam endpoint lives on a different port (1984
        // by default) so it gets its own proxy entry pointing at the
        // same host.
        proxy: (() => {
            const backendHttp = process.env.MAINSAIL_BAMBU_BACKEND || 'http://192.168.0.20:7125'
            const backendWs = backendHttp.replace(/^http/, 'ws')
            const backendUrl = new URL(backendHttp)
            const webcamHttp = `http://${backendUrl.hostname}:1984`
            const httpProxy = { target: backendHttp, changeOrigin: true }
            return {
                '/printer': httpProxy,
                '/access': httpProxy,
                '/api': httpProxy,
                '/server': httpProxy,
                '/scan': httpProxy,
                '/websocket': { target: backendWs, ws: true, changeOrigin: true },
                '/webcam': { target: webcamHttp, changeOrigin: true, ws: true },
            }
        })(),
    },

    test: {
        environment: 'node',
        include: ['tests/**/*.spec.ts'],
    },
})
