type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (command: "event", eventName: string, props?: AnalyticsProps) => void;
    plausible?: (eventName: string, options?: { props?: AnalyticsProps }) => void;
    umami?: {
      track?: (eventName: string, props?: AnalyticsProps) => void;
    };
  }
}

export function trackEvent(eventName: string, props: AnalyticsProps = {}) {
  window.dataLayer?.push({ event: eventName, ...props });
  window.gtag?.("event", eventName, props);
  window.plausible?.(eventName, { props });
  window.umami?.track?.(eventName, props);
}
