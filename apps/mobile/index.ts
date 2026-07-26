// MUST stay first: wires env and platform before App (and its transitive
// imports) evaluate. ES imports are evaluated in order and before the
// importing module's body, so initialising below would run too late.
import './src/bootstrap';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
