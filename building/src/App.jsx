import { useEffect, useMemo, useRef, useState } from 'react';
import Clouds from './Clouds';
import { createPrecip } from './precip3d';

const ENV_KEY = import.meta.env.VITE_OWM_API_KEY || '';

const storage = {
  get key() {
    return localStorage.getItem('owmKey') || ENV_KEY;
  },
  set key(v) {
    localStorage.setItem('owmKey', v || '');
  },
  get city() {
    return localStorage.getItem('owmCity') || '';
  },
  set city(v) {
    localStorage.setItem('owmCity', v || '');
  }
};

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function rndInt(min, max) {
  return Math.floor(random(min, max));
}

function generateLayer(options) {
  const { minW, maxW, minH, maxH, color, gap } = options;
  const width = window.innerWidth;
  const items = [];
  let x = 0;

  while (x < width + 60) {
    const w = rndInt(minW, maxW);
    const h = rndInt(minH, maxH);
    items.push({
      id: `${x}-${w}-${h}-${Math.random()}`,
      left: x,
      width: w,
      height: h,
      color,
      fancyTop: Math.random() < 0.2
    });
    x += w + rndInt(gap * 0.5, gap * 1.5);
  }

  return items;
}

function buildClouds(count) {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const clouds = [];

  for (let i = 0; i < count; i += 1) {
    const scale = random(0.8, 1.4);
    const baseW = Math.min(520, Math.max(200, vw * 0.2 * scale));
    const baseH = Math.min(220, Math.max(90, baseW * 0.44));
    const n = rndInt(6, 10);

    let x = random(baseW * 0.02, baseW * 0.08);
    const puffs = [];

    for (let j = 0; j < n; j += 1) {
      const isMid = j > 1 && j < n - 1;
      const pr = isMid ? random(0.5, 0.8) : random(0.3, 0.55);
      const pw = baseH * pr * random(1.0, 1.35);
      const ph = pw * random(0.85, 1.0);
      const centerY = baseH * 0.38;
      const py = centerY - ph * 0.5 + random(-baseH * 0.15, isMid ? -baseH * 0.05 : baseH * 0.12);

      const hlX = rndInt(30, 50);
      const hlY = rndInt(25, 45);

      puffs.push({
        id: `${i}-${j}-${Math.random()}`,
        width: pw,
        height: ph,
        left: Math.min(x, baseW - pw),
        top: Math.max(0, Math.min(py, baseH - ph)),
        opacity: random(0.8, 1.0),
        zIndex: isMid ? 2 : 1,
        blur: random(0.6, 1.8),
        highlightX: hlX,
        highlightY: hlY
      });

      x += pw * random(0.38, 0.62);
      if (x > baseW * 0.9) {
        break;
      }
    }

    puffs.sort((a, b) => a.zIndex - b.zIndex);

    const duration = random(45, 100);

    clouds.push({
      id: `${i}-${Math.random()}`,
      width: baseW,
      height: baseH,
      top: rndInt(vh * 0.05, vh * 0.4),
      duration,
      delay: -random(0, duration),
      opacity: random(0.8, 1.0),
      bobDuration: random(5, 8.5),
      bobDelay: -Math.random() * 6,
      scale: random(0.95, 1.05),
      puffs
    });
  }

  return clouds;
}

function buildStars(n) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Array.from({ length: n }, (_, i) => ({
    id: `${i}-${Math.random()}`,
    left: Math.random() * w,
    top: Math.random() * h * 0.6,
    size: Math.random() < 0.7 ? 2 : 3,
    delay: -Math.random() * 3
  }));
}

function isNightNow(data) {
  const now = Math.floor(Date.now() / 1000);
  const rise = data?.sys?.sunrise;
  const set = data?.sys?.sunset;
  if (!rise || !set) {
    return false;
  }
  return !(now >= rise && now <= set);
}

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    const err = new Error('Netwerkfout: mogelijk offline of geblokkeerd door browser.');
    err.cause = e;
    err.status = 0;
    throw err;
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const msg = body?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

function mapError(e) {
  if (e.status === 401) {
    return 'Ongeldige API-sleutel (401). Controleer je key en of hij geactiveerd is.';
  }
  if (e.status === 404) {
    return 'Stad niet gevonden (404). Controleer de spelling.';
  }
  if (e.status === 429) {
    return 'Rate limit bereikt (429). Wacht even en probeer opnieuw.';
  }
  if (e.status === 0) {
    return 'Netwerkfout. Controleer je internet of draai via http(s).';
  }
  return `Mislukt: ${e.message || 'onbekende fout'}`;
}

async function getWeatherByCity(city, key) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${encodeURIComponent(key)}`;
  return fetchJson(url);
}

async function getWeatherByCoords(lat, lon, key) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${encodeURIComponent(key)}`;
  return fetchJson(url);
}

export default function App() {
  const canvasRef = useRef(null);
  const precipRef = useRef(null);
  const weatherDataRef = useRef(null);
  const nightIntervalRef = useRef(0);

  const [apiKey, setApiKey] = useState('');
  const [city, setCity] = useState('Amsterdam');
  const [status, setStatus] = useState('');
  const [statusCls, setStatusCls] = useState('');
  const [weather, setWeather] = useState(null);
  const [isNight, setIsNight] = useState(false);
  const [skyline, setSkyline] = useState({ far: [], mid: [], near: [] });
  const [clouds, setClouds] = useState([]);
  const [stars, setStars] = useState([]);

  useEffect(() => {
    setApiKey(storage.key);
    setCity(storage.city || 'Amsterdam');
  }, []);

  useEffect(() => {
    document.body.classList.toggle('night', isNight);
    return () => document.body.classList.remove('night');
  }, [isNight]);

  const rebuildSkyline = () => {
    setSkyline({
      far: generateLayer({ minW: 30, maxW: 70, minH: 90, maxH: 180, color: '#222734', gap: 10 }),
      mid: generateLayer({ minW: 40, maxW: 90, minH: 140, maxH: 260, color: '#242a37', gap: 12 }),
      near: generateLayer({ minW: 50, maxW: 120, minH: 200, maxH: 360, color: '#2b2f39', gap: 14 })
    });
  };

  const startPrecip = (type, intensity) => {
    precipRef.current?.setType(type, intensity);
  };

  const updateNightFromData = () => {
    const data = weatherDataRef.current;
    if (!data) {
      return;
    }

    const night = isNightNow(data);
    setIsNight(night);
    setStars(night ? buildStars(120) : []);
    precipRef.current?.setNight(night);
  };

  const applyVisuals = (data) => {
    weatherDataRef.current = data;
    updateNightFromData();

    if (nightIntervalRef.current) {
      clearInterval(nightIntervalRef.current);
    }
    nightIntervalRef.current = window.setInterval(updateNightFromData, 60000);

    const cloudPct = data?.clouds?.all ?? 0;
    const cloudCount = Math.max(5, Math.round((cloudPct / 100) * 20));
    setClouds(buildClouds(cloudCount));

    const main = data?.weather?.[0]?.main || '';
    let type = 'none';
    if (/Thunderstorm|Drizzle|Rain/i.test(main)) {
      type = 'rain';
    } else if (/Snow/i.test(main)) {
      type = 'snow';
    }

    let intensity = 0;
    if (type === 'rain') {
      const r1 = data?.rain?.['1h'] ?? 0;
      const r3 = data?.rain?.['3h'] ?? 0;
      intensity = r1 ? r1 * 120 : (r3 ? (r3 / 3) * 100 : Math.max(30, cloudPct * 0.8));
    } else if (type === 'snow') {
      const s1 = data?.snow?.['1h'] ?? 0;
      const s3 = data?.snow?.['3h'] ?? 0;
      intensity = s1 ? s1 * 100 : (s3 ? (s3 / 3) * 80 : Math.max(20, cloudPct * 0.6));
    }

    startPrecip(type, intensity);
  };

  useEffect(() => {
    if (canvasRef.current) {
      precipRef.current = createPrecip(canvasRef.current);
    }
    rebuildSkyline();
    setClouds(buildClouds(8));

    const onResize = () => {
      precipRef.current?.resize();
      rebuildSkyline();
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      precipRef.current?.dispose();
      precipRef.current = null;
      if (nightIntervalRef.current) {
        clearInterval(nightIntervalRef.current);
      }
    };
  }, []);

  const setStatusMessage = (msg, cls = '') => {
    setStatus(msg || '');
    setStatusCls(cls);
  };

  const weatherView = useMemo(() => {
    if (!weather) {
      return null;
    }
    return {
      name: weather.name,
      temp: weather.main?.temp,
      desc: weather.weather?.[0]?.description || '',
      icon: weather.weather?.[0]?.icon ? `https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png` : ''
    };
  }, [weather]);

  const updateByCity = async () => {
    const key = apiKey.trim();
    const cityName = city.trim();
    if (!key) {
      setStatusMessage('Vul je OpenWeatherMap API-sleutel in.', 'warn');
      return;
    }
    if (!cityName) {
      setStatusMessage('Vul een stad in.', 'warn');
      return;
    }

    setStatusMessage('Laden...');
    try {
      const data = await getWeatherByCity(cityName, key);
      storage.key = key;
      storage.city = cityName;
      setWeather(data);
      applyVisuals(data);
      setStatusMessage('Bijgewerkt', 'ok');
    } catch (e) {
      console.error(e);
      setStatusMessage(mapError(e), 'warn');
    }
  };

  const updateByGeo = async () => {
    const key = apiKey.trim();
    if (!key) {
      setStatusMessage('Vul je OpenWeatherMap API-sleutel in.', 'warn');
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatusMessage('Geolocatie niet beschikbaar.', 'warn');
      return;
    }

    setStatusMessage('Zoeken naar locatie...');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const data = await getWeatherByCoords(lat, lon, key);
          storage.key = key;
          storage.city = data.name || '';
          if (storage.city) {
            setCity(storage.city);
          }
          setWeather(data);
          applyVisuals(data);
          setStatusMessage('Bijgewerkt (locatie)', 'ok');
        } catch (e) {
          console.error(e);
          setStatusMessage(mapError(e), 'warn');
        }
      },
      (err) => {
        console.warn(err);
        setStatusMessage('Locatie toestemming geweigerd.', 'warn');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const testKey = async () => {
    const key = apiKey.trim();
    if (!key) {
      setStatusMessage('Geen key ingevuld.', 'warn');
      return;
    }

    setStatusMessage('Key testen...');
    try {
      await getWeatherByCoords(0, 0, key);
      storage.key = key;
      setStatusMessage('API-sleutel OK', 'ok');
    } catch (e) {
      console.error(e);
      setStatusMessage(mapError(e), 'warn');
    }
  };

  return (
    <div className="app">
      <div className="sky">
        <div className="stars">
          {stars.map((star) => (
            <div
              key={star.id}
              className="star"
              style={{
                left: `${star.left}px`,
                top: `${star.top}px`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`
              }}
            />
          ))}
        </div>
        <div className="moon" />
        <Clouds clouds={clouds} />
      </div>

      <canvas ref={canvasRef} id="precip" />

      <div className="city">
        <div className="layer far">
          {skyline.far.map((b) => (
            <div
              key={b.id}
              className="building"
              style={{
                left: `${b.left}px`,
                width: `${b.width}px`,
                height: `${b.height}px`,
                backgroundColor: b.color,
                clipPath: b.fancyTop
                  ? 'polygon(0% 100%, 0% 10%, 15% 10%, 15% 0%, 30% 0%, 30% 10%, 70% 10%, 70% 25%, 85% 25%, 85% 10%, 100% 10%, 100% 100%)'
                  : undefined
              }}
            />
          ))}
        </div>
        <div className="layer mid">
          {skyline.mid.map((b) => (
            <div
              key={b.id}
              className="building"
              style={{
                left: `${b.left}px`,
                width: `${b.width}px`,
                height: `${b.height}px`,
                backgroundColor: b.color,
                clipPath: b.fancyTop
                  ? 'polygon(0% 100%, 0% 10%, 15% 10%, 15% 0%, 30% 0%, 30% 10%, 70% 10%, 70% 25%, 85% 25%, 85% 10%, 100% 10%, 100% 100%)'
                  : undefined
              }}
            />
          ))}
        </div>
        <div className="layer near">
          {skyline.near.map((b) => (
            <div
              key={b.id}
              className="building"
              style={{
                left: `${b.left}px`,
                width: `${b.width}px`,
                height: `${b.height}px`,
                backgroundColor: b.color,
                clipPath: b.fancyTop
                  ? 'polygon(0% 100%, 0% 10%, 15% 10%, 15% 0%, 30% 0%, 30% 10%, 70% 10%, 70% 25%, 85% 25%, 85% 10%, 100% 10%, 100% 100%)'
                  : undefined
              }}
            />
          ))}
        </div>
        <div className="ground" />
      </div>

      <div className="hud">
        <h1>Skyline Stad • Realtime Weer</h1>
        <div className="row">
          <label htmlFor="apiKey">API-sleutel (OpenWeatherMap)</label>
          <input
            type="password"
            id="apiKey"
            placeholder="voer je OWM API key in"
            value={apiKey}
            onChange={(e) => {
              const v = e.target.value;
              setApiKey(v);
              storage.key = v.trim();
            }}
          />
          <button type="button" title="Test je API key" onClick={testKey}>
            Test key
          </button>
        </div>

        <div className="row">
          <label htmlFor="city">Stad</label>
          <input
            type="text"
            id="city"
            placeholder="bijv. Amsterdam"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                updateByCity();
              }
            }}
          />
          <button type="button" onClick={updateByCity}>
            Zoek
          </button>
          <button type="button" onClick={updateByGeo}>
            Mijn locatie
          </button>
        </div>

        <div className="meta">
          Tip: maak gratis een API key op openweathermap.org. Je key wordt lokaal opgeslagen.
        </div>

        <div className={`status ${statusCls}`}>{status}</div>

        <div className="weather-line">
          {weatherView?.icon ? <img alt={weatherView.desc} src={weatherView.icon} /> : null}
          {weatherView ? (
            <div>
              <div>
                <strong>{weatherView.name}</strong> • {weatherView.temp != null ? `${Math.round(weatherView.temp)}°C` : ''}
              </div>
              <div className="weather-desc">{weatherView.desc}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
