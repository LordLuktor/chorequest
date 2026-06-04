// Custom entry point.
//
// We keep expo-router's normal entry (it registers the app's root component),
// then additionally register the Android widget's headless task. Registering
// the task at the JS entry is required so Android can run it in the background
// even when the app UI isn't mounted.
//
// Guarded to Android: react-native-android-widget's native module only exists
// there, and iOS/web should never touch it.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./widgets/widget-task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
