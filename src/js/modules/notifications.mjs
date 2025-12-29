// Lightweight toast/notification helpers, loaded on demand
import { safeReload } from '../utils/safe-reload.mjs';

function createNotificationElement(message, primaryButtonText, secondaryButtonText, primaryAction) {
  const notification = document.createElement('div');
  notification.className = 'notification-toast';
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');

  const content = document.createElement('div');
  content.className = 'notification-content';

  const messageElement = document.createElement('p');
  messageElement.textContent = String(message ?? '');

  const actions = document.createElement('div');
  actions.className = 'notification-actions';

  const primaryButton = document.createElement('button');
  primaryButton.className = 'primary-action';
  primaryButton.type = 'button';
  primaryButton.textContent = String(primaryButtonText ?? '');

  const secondaryButton = document.createElement('button');
  secondaryButton.className = 'secondary-action';
  secondaryButton.type = 'button';
  secondaryButton.textContent = String(secondaryButtonText ?? '');

  actions.append(primaryButton, secondaryButton);
  content.append(messageElement, actions);
  notification.append(content);

  primaryButton.addEventListener('click', () => {
    try {
      primaryAction();
    } catch (err) {
      console.error('Primary action failed:', err);
    }
    notification.remove();
  });

  secondaryButton.addEventListener('click', () => {
    notification.remove();
  });

  return notification;
}

function showNotification(notificationElement) {
  const existingNotification = document.querySelector('.notification-toast');
  if (existingNotification) {
    existingNotification.remove();
  }
  document.body.appendChild(notificationElement);
  setTimeout(
    () => {
      if (document.body.contains(notificationElement)) {
        notificationElement.remove();
      }
    },
    5 * 60 * 1000
  );
}

export function showUpdateNotification(serviceWorker, message = 'Una versión está disponible') {
  const notification = createNotificationElement(message, 'Actualizar ahora', 'Después', () => {
    if (serviceWorker) {
      serviceWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      safeReload();
    }
  });
  showNotification(notification);
}

export function showServiceWorkerError(message) {
  const notification = createNotificationElement(message, 'Reload', 'Dismiss', () => safeReload());
  showNotification(notification);
}

export function showConnectivityNotification(message) {
  const notification = createNotificationElement(message, 'Retry', 'Dismiss', () => safeReload());
  showNotification(notification);
}

export { createNotificationElement, showNotification };
