// Lightweight toast/notification helpers, loaded on demand

function createNotificationElement(message, primaryButtonText, secondaryButtonText, primaryAction) {
  const notification = document.createElement('div');
  notification.className = 'notification-toast';
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');

  notification.innerHTML = `
        <div class="notification-content">
            <p>${message}</p>
            <div class="notification-actions">
                <button class="primary-action">${primaryButtonText}</button>
                <button class="secondary-action">${secondaryButtonText}</button>
            </div>
        </div>
    `;

  notification.querySelector('.primary-action').addEventListener('click', () => {
    try {
      primaryAction();
    } catch (err) {
      console.error('Primary action failed:', err);
    }
    notification.remove();
  });

  notification.querySelector('.secondary-action').addEventListener('click', () => {
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
  setTimeout(() => {
    if (document.body.contains(notificationElement)) {
      notificationElement.remove();
    }
  }, 5 * 60 * 1000);
}

export function showUpdateNotification(serviceWorker, message = 'Una versión está disponible') {
  const notification = createNotificationElement(
    message,
    'Actualizar ahora',
    'Después',
    () => {
      if (serviceWorker) {
        serviceWorker.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    }
  );
  showNotification(notification);
}

export function showServiceWorkerError(message) {
  const notification = createNotificationElement(
    message,
    'Reload',
    'Dismiss',
    () => window.location.reload()
  );
  showNotification(notification);
}

export function showConnectivityNotification(message) {
  const notification = createNotificationElement(
    message,
    'Retry',
    'Dismiss',
    () => window.location.reload()
  );
  showNotification(notification);
}

export {
  createNotificationElement,
  showNotification
};

