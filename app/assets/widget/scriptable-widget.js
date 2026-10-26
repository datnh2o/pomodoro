// Widget "Daily Quest" (nhiệm vụ hằng ngày) cho app Scriptable (iPhone).
// Tạo từ app: Cài đặt > Thông báo > Widget màn hình chính, đã điền sẵn địa chỉ và mã link chia sẻ chỉ đọc.
// Dùng được cho widget nhỏ / vừa / lớn ở màn hình chính và widget màn hình khoá.

const ENDPOINT = "__WIDGET_ENDPOINT__";
const APP_URL = "__APP_URL__";
const REFRESH_MINUTES = 15;

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.cacheDirectory(), "nhiem-vu-hang-ngay.json");

const C = {
  bg: Color.dynamic(new Color("#ffffff"), new Color("#111827")),
  text: Color.dynamic(new Color("#111827"), new Color("#f9fafb")),
  muted: Color.dynamic(new Color("#6b7280"), new Color("#9ca3af")),
  track: Color.dynamic(new Color("#e5e7eb"), new Color("#374151")),
  done: new Color("#22c55e"),
  primary: new Color("#BA4949"),
  red: Color.dynamic(new Color("#dc2626"), new Color("#f87171")),
  amber: Color.dynamic(new Color("#b45309"), new Color("#fbbf24")),
  sky: Color.dynamic(new Color("#0369a1"), new Color("#7dd3fc")),
};

// ---- Dữ liệu: tải mới, lỗi mạng thì dùng bản lưu lần trước ----

async function load() {
  try {
    const req = new Request(ENDPOINT);
    req.timeoutInterval = 15;
    const body = await req.loadJSON();
    const status = req.response ? req.response.statusCode : 0;
    if (status !== 200) throw new Error((body && (body.statusMessage || body.message)) || "Lỗi " + status);
    fm.writeString(CACHE, JSON.stringify(body));
    return { data: body, stale: false, error: null };
  } catch (e) {
    const cached = fm.fileExists(CACHE) ? fm.readString(CACHE) : null;
    return { data: cached ? JSON.parse(cached) : null, stale: true, error: String((e && e.message) || e) };
  }
}

// ---- Định dạng ----

function short(n) {
  if (n >= 1000000) return (Math.round(n / 100000) / 10).toString().replace(".", ",") + "tr";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return n + " ₫";
}

function timeLabel(task) {
  if (task.deadline) return "hạn " + task.deadline;
  return task.time || "";
}

function hhmm(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function status(d) {
  if (d.rest) return { icon: "beach.umbrella", text: "Ngày nghỉ", color: C.sky };
  if (!d.total) return { icon: "checkmark.circle", text: "Không có nhiệm vụ chính", color: C.muted };
  if (d.allDone) {
    return d.chestOpened
      ? { icon: "gift.fill", text: "Đã mở rương" + (d.reward ? " +" + short(d.reward) : ""), color: C.done }
      : { icon: "gift.fill", text: "Rương đang chờ mở!", color: C.amber };
  }
  return { icon: "exclamationmark.triangle.fill", text: "Còn " + (d.total - d.done) + " việc · mất " + short(d.atRisk), color: C.amber };
}

// ---- Thành phần giao diện ----

function text(parent, str, size, color, weight) {
  const t = parent.addText(str);
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "semibold" ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function symbol(parent, name, size, color) {
  const s = SFSymbol.named(name);
  if (!s) return null;
  const img = parent.addImage(s.image);
  img.imageSize = new Size(size, size);
  img.tintColor = color;
  return img;
}

function row(parent) {
  const s = parent.addStack();
  s.layoutHorizontally();
  s.centerAlignContent();
  return s;
}

/** Thanh tiến độ: mỗi việc một ô (tối đa 10 việc), nhiều hơn thì một thanh liền */
function progress(parent, done, total, width) {
  if (!total) return;
  const height = 6;
  const bar = row(parent);
  if (total <= 10) {
    const gap = 3;
    bar.spacing = gap;
    const seg = (width - gap * (total - 1)) / total;
    for (let i = 0; i < total; i++) {
      const s = bar.addStack();
      s.size = new Size(seg, height);
      s.cornerRadius = height / 2;
      s.backgroundColor = i < done ? C.done : C.track;
    }
    return;
  }
  bar.size = new Size(width, height);
  bar.cornerRadius = height / 2;
  bar.backgroundColor = C.track;
  const fill = bar.addStack();
  fill.size = new Size(Math.max(height, Math.round((width * done) / total)), height);
  fill.cornerRadius = height / 2;
  fill.backgroundColor = C.done;
  bar.addSpacer();
}

function header(parent, d, stale) {
  const h = row(parent);
  symbol(h, "checklist", 13, C.primary);
  h.addSpacer(4);
  text(h, "Hôm nay", 12, C.muted, "semibold");
  h.addSpacer();
  if (stale) {
    symbol(h, "wifi.slash", 11, C.muted);
    h.addSpacer(4);
  }
  symbol(h, d.allDone ? "gift.fill" : "gift", 14, d.allDone ? (d.chestOpened ? C.done : C.amber) : C.muted);
}

function counter(parent, d, size) {
  const r = row(parent);
  text(r, d.done + "/" + d.total, size, C.text, "bold");
  r.addSpacer(4);
  text(r, "việc chính", Math.round(size * 0.42), C.muted);
}

function statusRow(parent, d, size) {
  const st = status(d);
  const r = row(parent);
  symbol(r, st.icon, size, st.color);
  r.addSpacer(4);
  text(r, st.text, size, st.color, "semibold");
}

function nextRow(parent, d, size) {
  if (!d.next) return statusRow(parent, d, size - 1);
  text(parent, "Tiếp: " + d.next.title, size, C.text, "semibold");
  const when = timeLabel(d.next);
  if (when) text(parent, when, size - 1, C.muted);
}

function moneyRow(parent, d, size) {
  const r = row(parent);
  symbol(r, "dollarsign.circle.fill", size, C.amber);
  r.addSpacer(3);
  text(r, short(d.rewardTotal), size, C.amber, "semibold");
  r.addSpacer(8);
  symbol(r, "creditcard.fill", size, C.red);
  r.addSpacer(3);
  text(r, short(d.penaltyTotal), size, C.red, "semibold");
}

function taskList(parent, d, max, size) {
  const shown = d.tasks.slice(0, max);
  for (const task of shown) {
    const r = row(parent);
    symbol(r, task.done ? "checkmark.circle.fill" : "circle", size + 1, task.done ? C.done : C.muted);
    r.addSpacer(5);
    text(r, task.title, size, task.done ? C.muted : C.text, task.done ? undefined : "semibold");
    r.addSpacer();
    const when = timeLabel(task);
    if (when && !task.done) text(r, when, size - 1, C.muted);
    parent.addSpacer(3);
  }
  const more = d.tasks.length - shown.length;
  const extra = [];
  if (more > 0) extra.push("+" + more + " việc chính");
  if (d.sidePending) extra.push(d.sidePending + " việc phụ chưa xong");
  if (extra.length) text(parent, extra.join(" · "), size - 1, C.muted);
}

// ---- Bố cục theo cỡ widget ----

function small(w, d, stale) {
  header(w, d, stale);
  w.addSpacer(6);
  counter(w, d, 30);
  w.addSpacer(4);
  progress(w, d.done, d.total, 127);
  w.addSpacer();
  nextRow(w, d, 12);
  w.addSpacer(4);
  moneyRow(w, d, 10);
}

function medium(w, d, stale) {
  const cols = row(w);
  cols.topAlignContent();
  const left = cols.addStack();
  left.layoutVertically();
  left.size = new Size(122, 0);
  header(left, d, stale);
  left.addSpacer(6);
  counter(left, d, 30);
  left.addSpacer(4);
  progress(left, d.done, d.total, 122);
  left.addSpacer();
  statusRow(left, d, 10);
  left.addSpacer(4);
  moneyRow(left, d, 10);
  cols.addSpacer(14);
  const right = cols.addStack();
  right.layoutVertically();
  if (!d.tasks.length) statusRow(right, d, 12);
  else taskList(right, d, 4, 12);
  right.addSpacer();
}

function large(w, d, stale) {
  header(w, d, stale);
  w.addSpacer(2);
  text(w, d.name, 11, C.muted);
  w.addSpacer(8);
  counter(w, d, 34);
  w.addSpacer(6);
  progress(w, d.done, d.total, 300);
  w.addSpacer(6);
  statusRow(w, d, 12);
  w.addSpacer(12);
  if (d.tasks.length) taskList(w, d, 9, 13);
  w.addSpacer();
  const foot = row(w);
  moneyRow(foot, d, 11);
  foot.addSpacer();
  text(foot, "cập nhật " + hhmm(d.generatedAt), 10, C.muted);
}

// Màn hình khoá: hệ thống tự tô màu, chỉ cần chữ và biểu tượng
function inline(w, d) {
  const what = d.next ? d.next.title + (timeLabel(d.next) ? " " + timeLabel(d.next) : "") : status(d).text;
  w.addText(d.done + "/" + d.total + " · " + what);
}

function circular(w, d) {
  w.addAccessoryWidgetBackground = true;
  const n = w.addText(d.done + "/" + d.total);
  n.font = Font.boldSystemFont(16);
  n.centerAlignText();
  const l = w.addText(d.allDone ? "xong" : "việc");
  l.font = Font.systemFont(9);
  l.centerAlignText();
}

function rectangular(w, d) {
  const t = w.addText("Nhiệm vụ " + d.done + "/" + d.total);
  t.font = Font.boldSystemFont(13);
  if (d.next) {
    const n = w.addText(d.next.title);
    n.font = Font.systemFont(12);
    n.lineLimit = 1;
    const when = timeLabel(d.next);
    const s = w.addText((when ? when + " · " : "") + "còn " + (d.total - d.done) + " việc");
    s.font = Font.systemFont(11);
  } else {
    const s = w.addText(status(d).text);
    s.font = Font.systemFont(12);
  }
}

function failure(w, error) {
  symbol(w, "exclamationmark.icloud", 18, C.muted);
  w.addSpacer(6);
  text(w, "Không tải được dữ liệu", 13, C.text, "semibold");
  w.addSpacer(4);
  const e = w.addText(error || "");
  e.font = Font.systemFont(10);
  e.textColor = C.muted;
  e.lineLimit = 3;
}

function build(family, data, stale, error) {
  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);
  const accessory = family === "accessoryInline" || family === "accessoryCircular" || family === "accessoryRectangular";
  if (!accessory) {
    w.backgroundColor = C.bg;
    w.setPadding(14, 14, 14, 14);
  }
  if (!data) {
    if (accessory) w.addText("Lỗi tải");
    else failure(w, error);
    return w;
  }
  if (family === "accessoryInline") inline(w, data);
  else if (family === "accessoryCircular") circular(w, data);
  else if (family === "accessoryRectangular") rectangular(w, data);
  else if (family === "small") small(w, data, stale);
  else if (family === "large" || family === "extraLarge") large(w, data, stale);
  else medium(w, data, stale);
  return w;
}

const result = await load();
const widget = build(config.widgetFamily || "medium", result.data, result.stale, result.error);
if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
