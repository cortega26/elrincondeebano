import { resolveProductDataUrl } from '../utils/data-endpoint.mjs';
import {
    normalizeProductVersion,
    getStoredProductVersion,
    setStoredProductVersion,
} from '../utils/product-data.mjs';
import { log } from '../utils/logger.mts';
import { UTILITY_CLASSES } from '../script.mjs';

// Service Worker Configuration and Initialization
const SERVICE_WORKER_CONFIG = {
    path: '/service-worker.js',
    scope: '/',
    updateCheckInterval: 5 * 60 * 1000, // 5 minutes
};

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

let serviceWorkerRegistrationSetup = false;

// Notifications are lazy-loaded to reduce initial JS
let __notificationsModulePromise = null;
function __loadNotifications() {
    if (!__notificationsModulePromise) {
        __notificationsModulePromise = import('./notifications.mjs');
    }
    return __notificationsModulePromise;
}

function showUpdateNotification(serviceWorker, message = 'Una versión está disponible') {
    __loadNotifications().then((m) => m.showUpdateNotification(serviceWorker, message));
}

function showServiceWorkerError(message) {
    __loadNotifications().then((m) => m.showServiceWorkerError(message));
}

function showConnectivityNotification(message) {
    __loadNotifications().then((m) => m.showConnectivityNotification(message));
}

function safeReadLocalStorage(key) {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const storage = window.localStorage ?? globalThis.localStorage ?? null;
        if (!storage) {
            return null;
        }
        return storage.getItem(key);
    } catch (error) {
        log('warn', 'sw_local_storage_unavailable', { key, error });
        return null;
    }
}

export function shouldRegisterServiceWorker() {
    if (typeof window === 'undefined') {
        return false;
    }

    const disabledFlag = safeReadLocalStorage('ebano-sw-disabled');
    if (disabledFlag === 'true') {
        log('info', 'sw_registration_skipped_kill_switch');
        return false;
    }

    const hostname = window.location?.hostname ?? '';
    const isLocalhost = LOCALHOST_HOSTNAMES.has(hostname);
    if (isLocalhost) {
        const enableLocalFlag = safeReadLocalStorage('ebano-sw-enable-local');
        const query = window.location?.search ?? '';
        const queryEnables = typeof query === 'string' && /(?:^|[?&])sw=on(?:&|$)/i.test(query);
        if (enableLocalFlag === 'true' || queryEnables) {
            return true;
        }
        log('info', 'sw_registration_skipped_localhost', {
            hint: 'Set localStorage ebano-sw-enable-local=true or use ?sw=on',
        });
        return false;
    }

    return true;
}

// Enhanced service worker registration with proper error handling and lifecycle management
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        log('warn', 'sw_not_supported');
        return;
    }

    if (!shouldRegisterServiceWorker()) {
        return;
    }

    if (serviceWorkerRegistrationSetup) {
        return;
    }

    serviceWorkerRegistrationSetup = true;

    const startRegistration = async () => {
        if (document.readyState !== 'complete') {
            return;
        }

        try {
            window.removeEventListener('load', startRegistration);
        } catch {
            // ignore
        }

        try {
            await initializeServiceWorker();
        } catch (error) {
            log('error', 'sw_initialization_failed', { error });
            showServiceWorkerError(
                'Failed to initialize service worker. Some features may not work offline.'
            );
        }
    };

    window.addEventListener('load', startRegistration);
    if (document.readyState === 'complete') {
        startRegistration();
    }
}

export function __resetServiceWorkerRegistrationForTest() {
    serviceWorkerRegistrationSetup = false;
}

// Initialize the service worker and set up event handlers
async function initializeServiceWorker() {
    try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_CONFIG.path, {
            scope: SERVICE_WORKER_CONFIG.scope,
        });

        log('info', 'sw_registered', { scope: registration.scope });

        // Set up update handling
        setupUpdateHandling(registration);

        // Set up periodic update checks
        setupPeriodicUpdateCheck(registration);

        // Handle controller changes
        setupControllerChangeHandling();

        // Set up offline/online detection
        setupConnectivityHandling();
    } catch (error) {
        log('error', 'sw_registration_failed', { error });
        throw error;
    }
}

// Set up handling for service worker updates
function setupUpdateHandling(registration) {
    registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Immediately activate the new service worker without a prompt
                newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
        });
    });
}

// Set up periodic checks for service worker updates
function setupPeriodicUpdateCheck(registration) {
    // Initial check
    checkForUpdates(registration);

    // Set up periodic checks
    setInterval(() => {
        checkForUpdates(registration);
    }, SERVICE_WORKER_CONFIG.updateCheckInterval);
}

// Check for service worker updates
async function checkForUpdates(registration) {
    if (typeof window !== 'undefined' && window.__ENABLE_TEST_HOOKS__ === true) {
        return;
    }
    try {
        try {
            await registration.update();
        } catch (error) {
            log('warn', 'sw_update_check_failed', { error });
        }

        // Check if product data needs updating
        const url = resolveProductDataUrl();
        const response = await fetch(url, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });

        if (response.ok) {
            const data = await response.json();
            const currentVersion = normalizeProductVersion(data.version);
            const storedVersion = getStoredProductVersion();

            if (!currentVersion) {
                return;
            }

            if (currentVersion !== storedVersion) {
                registration.active?.postMessage({
                    type: 'INVALIDATE_PRODUCT_CACHE',
                });

                setStoredProductVersion(currentVersion);
                if (typeof window !== 'undefined' && window.__ENABLE_TEST_HOOKS__ === true) {
                    window.__updateNotificationCount =
                        typeof window.__updateNotificationCount === 'number'
                            ? window.__updateNotificationCount + 1
                            : 1;
                    window.__lastUpdateVersion = currentVersion;
                }
                showUpdateNotification(null, 'New product data available');
            }
        }
    } catch (error) {
        log('warn', 'sw_background_check_failed', { error });
    }
}

export async function runUpdateCheckForTest() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
        return null;
    }
    if (typeof window !== 'undefined' && window.__ENABLE_TEST_HOOKS__ === true) {
        const overrideVersion = normalizeProductVersion(window.__TEST_UPDATE_VERSION__);
        if (overrideVersion) {
            const storedVersion = getStoredProductVersion();
            const updated = overrideVersion !== storedVersion;
            if (updated) {
                setStoredProductVersion(overrideVersion);
                window.__updateNotificationCount =
                    typeof window.__updateNotificationCount === 'number'
                        ? window.__updateNotificationCount + 1
                        : 1;
                window.__lastUpdateVersion = overrideVersion;
                showUpdateNotification(null, 'New product data available');
            }
            return { updated, currentVersion: overrideVersion, storedVersion };
        }
    }
    let registration = null;
    try {
        registration = await navigator.serviceWorker.ready;
    } catch {
        registration = null;
    }
    if (!registration) {
        try {
            registration = await navigator.serviceWorker.getRegistration();
        } catch {
            registration = null;
        }
    }
    if (!registration) {
        return null;
    }
    return checkForUpdates(registration);
}

function exposeUpdateCheckForTests() {
    if (typeof window === 'undefined') {
        return;
    }
    if (window.__ENABLE_TEST_HOOKS__ !== true) {
        return;
    }
    if (typeof window.__runUpdateCheck === 'function') {
        return;
    }
    Object.defineProperty(window, '__runUpdateCheck', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: runUpdateCheckForTest,
    });
}

exposeUpdateCheckForTests();

// Set up handling for service worker controller changes
function setupControllerChangeHandling() {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            if (typeof window !== 'undefined' && window.__DISABLE_SW_RELOAD__ === true) {
                refreshing = true;
                return;
            }
            refreshing = true;
            window.location.reload();
        }
    });
}

// Set up handling for online/offline connectivity
function setupConnectivityHandling() {
    const offlineIndicator = document.getElementById('offline-indicator');
    if (!offlineIndicator) {
        return;
    }
    const updateOnlineStatus = () => {
        const hidden = navigator.onLine;
        if (UTILITY_CLASSES) {
            offlineIndicator.classList.toggle(UTILITY_CLASSES.hidden, hidden);
            offlineIndicator.classList.toggle(UTILITY_CLASSES.block, !hidden);
        } else {
            // Fallback if UTILITY_CLASSES is missing/circular dependency
            if (hidden) offlineIndicator.classList.add('is-hidden');
            else offlineIndicator.classList.remove('is-hidden');
        }

        if (!hidden) {
            showConnectivityNotification('You are currently offline. Some features may be limited.');
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if (!navigator.onLine) {
        updateOnlineStatus();
    }
}
