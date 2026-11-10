// Resolution Fitness App — Cross-platform alert
//
// react-native-web ships `Alert` as a literal no-op (`static alert() {}`),
// so every Alert.alert() call silently does nothing when the app runs in a
// browser — including the logout confirmation. On web we fall back to the
// browser's native dialogs so buttons actually fire their onPress handlers.

import { Alert, Platform } from 'react-native';

function format(title, message) {
  return [title, message].filter(Boolean).join('\n\n');
}

export function showAlert(title, message, buttons) {
  // Native: the real React Native alert.
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const actions = (Array.isArray(buttons) ? buttons : []).filter(
    (button) => button && button.text
  );
  const text = format(title, message);

  // Plain message, or a single acknowledgement button.
  if (actions.length <= 1) {
    window.alert(text);
    if (actions[0]?.onPress) actions[0].onPress();
    return;
  }

  // Confirmation: window.confirm() answers the first non-cancel button.
  const cancelButton = actions.find((button) => button.style === 'cancel');
  const confirmButton =
    actions.find((button) => button !== cancelButton) || actions[0];

  if (window.confirm(text)) {
    if (confirmButton?.onPress) confirmButton.onPress();
  } else if (cancelButton?.onPress) {
    cancelButton.onPress();
  }
}

export default showAlert;
