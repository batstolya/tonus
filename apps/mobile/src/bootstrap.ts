// Side-effect module: wires env and platform before anything reads them.
//
// It must be the FIRST import of index.ts. ES module imports are evaluated in
// order and before the importing module's own body, so initialising inside
// index.ts's body would run too late — App and its transitive imports would
// already have evaluated. This is the same class of bug that blanked the web
// app in Phase 0a, caught then only by e2e.
import { initMobileEnv } from './env.native'
import { initMobilePlatform } from './platform.native'

initMobileEnv()
initMobilePlatform()
