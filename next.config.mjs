import path from 'path';
import { fileURLToPath } from 'url';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `npm run build:e2e` sets this: the e2e suite runs against a frozen fixture of
// the original demo products, in its own build folder, so it never depends on
// what is published in data/catalog.json and never replaces the real build.
const e2e = process.env.CATALOG_FIXTURE === 'e2e';
const E2E_CATALOG = path.resolve(__dirname, 'tests/fixtures/catalog.public.e2e.json');

// `npm run dev` builds into .next-dev, so running `npm run build` (.next) while the
// dev server is up can't delete files the dev server is still using.
const distDirFor = (phase) => (e2e ? '.next-e2e' : phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next');

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
    distDir: distDirFor(phase),
    // The e2e fixture products are priced in US cents: keep the demo money settings for that build.
    env: { NEXT_PUBLIC_STORE_PROFILE: e2e ? 'demo-usd' : '' },
    webpack: (config, { webpack }) => {
        config.resolve.alias['@'] = path.resolve(__dirname);
        if (e2e) {
            // Swap the file after resolution (the "@/..." path alias is resolved first).
            config.plugins.push(
                new webpack.NormalModuleReplacementPlugin(/data[\\/]catalog\.public\.json$/, (resource) => {
                    resource.request = E2E_CATALOG;
                    if (resource.createData) resource.createData.resource = E2E_CATALOG;
                }),
            );
        }
        return config;
    },
});

export default nextConfig;
