import React, { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Droplets,
  Moon,
  Snowflake,
  Sun,
} from 'lucide-react';
import { request } from '../services/http';

const MANILA_TIME_ZONE = 'Asia/Manila';
const WEATHER_CACHE_KEY = 'hrmdo.sidebar-weather.tacloban';
const WEATHER_CACHE_MS = 15 * 60 * 1000;

interface WeatherSnapshot {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  isDay: boolean;
  maximumTemperature: number;
  minimumTemperature: number;
  rainChance: number;
  fetchedAt: number;
}

const readCachedWeather = (): WeatherSnapshot | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null') as WeatherSnapshot | null;
    return parsed && Date.now() - parsed.fetchedAt < WEATHER_CACHE_MS ? parsed : null;
  } catch {
    return null;
  }
};

const weatherPresentation = (code: number, isDay: boolean) => {
  if (code === 0) return { label: 'Clear', Icon: isDay ? Sun : Moon, color: isDay ? 'text-amber-300' : 'text-indigo-200' };
  if (code <= 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', Icon: isDay ? CloudSun : CloudMoon, color: 'text-sky-300' };
  if (code === 3) return { label: 'Overcast', Icon: Cloud, color: 'text-slate-300' };
  if ([45, 48].includes(code)) return { label: 'Foggy', Icon: CloudFog, color: 'text-slate-300' };
  if (code >= 95) return { label: 'Thunderstorms', Icon: CloudLightning, color: 'text-amber-300' };
  if ((code >= 71 && code <= 77) || code >= 85 && code <= 86) return { label: 'Snow', Icon: Snowflake, color: 'text-sky-200' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', Icon: CloudRain, color: 'text-sky-300' };
  return { label: code >= 80 ? 'Rain showers' : 'Rain', Icon: CloudRain, color: 'text-sky-300' };
};

export const SidebarWeatherCard: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => readCachedWeather());
  const [weatherFailed, setWeatherFailed] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const cached = readCachedWeather();
    if (cached) {
      setWeather(cached);
      return;
    }

    const controller = new AbortController();
    request('weather.php', { signal: controller.signal })
      .then(data => {
        const snapshot: WeatherSnapshot = {
          temperature: Number(data.current?.temperature_2m),
          apparentTemperature: Number(data.current?.apparent_temperature),
          weatherCode: Number(data.current?.weather_code),
          isDay: data.current?.is_day === 1,
          maximumTemperature: Number(data.daily?.temperature_2m_max?.[0]),
          minimumTemperature: Number(data.daily?.temperature_2m_min?.[0]),
          rainChance: Number(data.daily?.precipitation_probability_max?.[0]),
          fetchedAt: Date.now(),
        };
        if (![snapshot.temperature, snapshot.weatherCode, snapshot.maximumTemperature, snapshot.minimumTemperature].every(Number.isFinite)) throw new Error('Invalid weather response');
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot));
        setWeather(snapshot);
        setWeatherFailed(false);
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setWeatherFailed(true);
      });
    return () => controller.abort();
  }, []);

  const time = useMemo(() => new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(now), [now]);
  const date = useMemo(() => new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now), [now]);
  const presentation = weather ? weatherPresentation(weather.weatherCode, weather.isDay) : null;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-800/80 shadow-sm" aria-label="Tacloban date, time, and weather">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-300">Tacloban City</p>
          <p className="mt-0.5 text-lg font-bold leading-none tracking-tight text-white">{time}</p>
          <p className="mt-1 truncate text-[10px] text-slate-400">{date}</p>
        </div>
        {weather && presentation ? (
          <div className="flex shrink-0 items-center gap-2 text-right">
            <presentation.Icon className={`h-8 w-8 ${presentation.color}`} strokeWidth={1.7} />
            <div>
              <p className="text-lg font-bold leading-none text-white">{Math.round(weather.temperature)}°</p>
              <p className="mt-1 max-w-20 truncate text-[9px] font-medium text-slate-300">{presentation.label}</p>
            </div>
          </div>
        ) : (
          <div className="flex h-10 w-20 items-center justify-center rounded-lg bg-slate-900/40 px-2 text-center text-[9px] leading-3 text-slate-400">
            {weatherFailed ? 'Weather unavailable' : 'Updating weather…'}
          </div>
        )}
      </div>

      {weather && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-700/70 bg-slate-900/25 px-3 py-2 text-[9px] text-slate-400">
          <span>Feels {Math.round(weather.apparentTemperature)}°</span>
          <span>H {Math.round(weather.maximumTemperature)}° · L {Math.round(weather.minimumTemperature)}°</span>
          <span className="inline-flex items-center gap-1"><Droplets className="h-3 w-3 text-sky-400" />{Math.round(weather.rainChance)}%</span>
        </div>
      )}
    </section>
  );
};
