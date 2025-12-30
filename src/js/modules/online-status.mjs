export function setupOnlineStatus({
  indicatorId = 'offline-indicator',
  utilityClasses = { hidden: 'is-hidden', block: 'is-block' },
} = {}) {
  const updateOnlineStatus = () => {
    const offlineIndicator = document.getElementById(indicatorId);
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (offlineIndicator) {
      offlineIndicator.classList.toggle(utilityClasses.hidden, isOnline);
      offlineIndicator.classList.toggle(utilityClasses.block, !isOnline);
    }
    if (!isOnline) {
      console.log('App is offline. Using cached data if available.');
    }
  };

  updateOnlineStatus();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  return updateOnlineStatus;
}
