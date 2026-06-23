// Learn more: https://docs.expo.dev/guides/monorepos/
const path = require('path');

// Monorepo root (two levels up from apps/mobile)
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Resolve @expo/metro-config from the monorepo root (all deps are hoisted)
const { getDefaultConfig } = require(
  path.resolve(monorepoRoot, 'node_modules', 'expo', 'metro-config')
);

const config = getDefaultConfig(projectRoot);

// Expo SQLite's web worker imports a wasm file that Metro must treat as an asset.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// 1. Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro resolve from both the project root and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Ensure Metro doesn't search up past the monorepo root
config.resolver.disableHierarchicalLookup = true;

// 4. Force all react imports to use the mobile project's local React (React 19)
// to prevent version mismatch errors (ReactCurrentDispatcher is undefined)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'node') {
    return context.resolveRequest(context, moduleName, platform);
  }

  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const localReactPath = moduleName === 'react'
      ? path.resolve(projectRoot, 'node_modules/react')
      : path.resolve(projectRoot, 'node_modules/react', moduleName.substring(6));
    return context.resolveRequest(context, localReactPath, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// 5. Add COEP and COOP headers to support SharedArrayBuffer for expo-sqlite on the web
config.server = config.server || {};
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  };
};

module.exports = config;

