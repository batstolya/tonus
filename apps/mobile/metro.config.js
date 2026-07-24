// Monorepo wiring (https://docs.expo.dev/guides/monorepos/). Recent Expo SDKs
// detect npm workspaces on their own; this is explicit so resolution does not
// depend on that heuristic.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the whole repo: @tonus/shared ships raw TypeScript from packages/shared.
config.watchFolders = [monorepoRoot]
// npm hoists react-native and expo to the root; look there as well as locally.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

module.exports = config
