import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and sets up the Expo dev / native environments consistently.
// We use this from mobile/index.js (referenced by both package.json "main"
// and Metro's bundle URL /index.bundle?platform=android&dev=true) so the
// emulator's default bundle request resolves cleanly under Expo SDK 54.
registerRootComponent(App);
