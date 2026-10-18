/**
 * Thời tiết ngắn gọn từ Open-Meteo (miễn phí, không cần key) theo vị trí của trình duyệt.
 * Vị trí và kết quả được cache trong localStorage (kết quả 30 phút).
 */
export interface WeatherNow {
  temperature: number;
  apparent: number;
  code: number;
  rainChance: number;
  max: number;
  min: number;
  fetchedAt: number;
}

const LOCATION_KEY = "weather:location";
const CACHE_KEY = "weather:cache";
const CACHE_MS = 30 * 60_000;

/** Mô tả tiếng Việt + icon theo mã WMO của Open-Meteo */
export const describeWeather = (code: number): { label: string; icon: string } => {
  if (code === 0) return { label: "Trời quang", icon: "i-lucide-sun" };
  if (code <= 2) return { label: "Ít mây", icon: "i-lucide-cloud-sun" };
  if (code === 3) return { label: "Nhiều mây", icon: "i-lucide-cloud" };
  if (code <= 48) return { label: "Sương mù", icon: "i-lucide-cloud-fog" };
  if (code <= 57) return { label: "Mưa phùn", icon: "i-lucide-cloud-drizzle" };
  if (code <= 67) return { label: "Mưa", icon: "i-lucide-cloud-rain" };
  if (code <= 77) return { label: "Tuyết", icon: "i-lucide-snowflake" };
  if (code <= 82) return { label: "Mưa rào", icon: "i-lucide-cloud-rain-wind" };
  return { label: "Dông", icon: "i-lucide-cloud-lightning" };
};

export const useWeather = () => {
  const weather = useState<WeatherNow | null>("weather:now", () => null);
  const status = useState<"idle" | "loading" | "no-location" | "error" | "ready">("weather:status", () => "idle");

  const readJson = <T>(key: string): T | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const writeJson = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* bộ nhớ riêng tư có thể từ chối */
    }
  };

  const fetchForecast = async (lat: number, lon: number): Promise<WeatherNow> => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "temperature_2m,apparent_temperature,weather_code",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "Asia/Ho_Chi_Minh",
      forecast_days: "1",
    }).toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = (await res.json()) as {
      current: { temperature_2m: number; apparent_temperature: number; weather_code: number };
      daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
    };
    return {
      temperature: Math.round(data.current.temperature_2m),
      apparent: Math.round(data.current.apparent_temperature),
      code: data.current.weather_code,
      rainChance: data.daily.precipitation_probability_max[0] ?? 0,
      max: Math.round(data.daily.temperature_2m_max[0] ?? 0),
      min: Math.round(data.daily.temperature_2m_min[0] ?? 0),
      fetchedAt: Date.now(),
    };
  };

  const getLocation = () =>
    new Promise<{ lat: number; lon: number }>((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("Trình duyệt không hỗ trợ định vị"));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => reject(err),
        { maximumAge: 60 * 60_000, timeout: 10_000 }
      );
    });

  /** Tải thời tiết. `askLocation` = true khi người dùng chủ động bấm (được phép hỏi quyền vị trí). */
  const load = async (askLocation = false) => {
    if (!import.meta.client) return;
    const cached = readJson<WeatherNow>(CACHE_KEY);
    if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
      weather.value = cached;
      status.value = "ready";
      return;
    }
    let location = readJson<{ lat: number; lon: number }>(LOCATION_KEY);
    if (!location) {
      if (!askLocation) {
        status.value = "no-location";
        return;
      }
      try {
        status.value = "loading";
        location = await getLocation();
        writeJson(LOCATION_KEY, location);
      } catch {
        status.value = "no-location";
        return;
      }
    }
    try {
      status.value = "loading";
      weather.value = await fetchForecast(location.lat, location.lon);
      writeJson(CACHE_KEY, weather.value);
      status.value = "ready";
    } catch (error) {
      console.warn("weather", error);
      status.value = "error";
    }
  };

  /** Xóa vị trí đã lưu để chọn lại */
  const resetLocation = () => {
    try {
      localStorage.removeItem(LOCATION_KEY);
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
    weather.value = null;
    status.value = "no-location";
  };

  return { weather, status, load, resetLocation };
};
