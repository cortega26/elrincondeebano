export {};

declare global {
  var process:
    | {
        env?: Record<string, string | undefined>;
      }
    | undefined;

  interface Window {
    __APP_READY__?: boolean;
    __analyticsTrack?: (eventName: string, properties?: Record<string, unknown>) => unknown;
    __ENABLE_TEST_HOOKS__?: boolean;
    __updateNotificationCount?: number;
    __lastUpdateVersion?: string;
    __TEST_UPDATE_VERSION__?: string;
    __runUpdateCheck?: () => Promise<unknown> | unknown;
    __DISABLE_SW_RELOAD__?: boolean;
    __ALLOW_LOCALHOST_HTTP__?: boolean;
    __DATA_ORIGIN_ALLOWLIST__?: string | string[];
    __DATA_HOST_ALLOWLIST__?: string | string[];
    __DATA_ORIGIN_ALLOWLIST?: string | string[];
    __DATA_HOST_ALLOWLIST?: string | string[];
    __ALLOW_CROSS_ORIGIN_DATA__?: boolean;
    __DATA_BASE_URL__?: string;
    __CFIMG_DISABLE__?: boolean;
    __CFIMG_ENABLE__?: boolean;
    __PRODUCT_DATA__?: {
      products: unknown[];
      version?: string | null;
      source?: string | null;
      updatedAt?: number;
      isPartial?: boolean;
      total?: number | null;
      [key: string]: unknown;
    };
  }
}
