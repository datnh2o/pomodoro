import template from "~/assets/widget/scriptable-widget.js?raw";

/** Link App Store của Scriptable (app miễn phí chạy widget viết bằng JavaScript trên iPhone) */
export const SCRIPTABLE_APP_URL = "https://apps.apple.com/app/scriptable/id1405459188";

/** Script widget đã điền sẵn địa chỉ API widget (theo mã link chia sẻ) và địa chỉ mở app khi chạm */
export const buildScriptableWidget = (endpoint: string, appUrl: string): string =>
  template
    .replace('"__WIDGET_ENDPOINT__"', () => JSON.stringify(endpoint))
    .replace('"__APP_URL__"', () => JSON.stringify(appUrl));
