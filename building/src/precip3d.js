import * as THREE from 'three';

// Maximum particles allocated up front. Intensity only changes the draw range,
// so we never rebuild geometry while the weather updates.
const MAX_RAIN = 6000;
const MAX_SNOW = 4000;

// World-space volume the particles live in (camera looks down -Z from +Z).
const RANGE_Y = 720; // vertical span; particles wrap within this
const SPREAD_X = 700; // half-width
const Z_NEAR = 240;
const Z_FAR = -320;

const RAIN_COLOR_DAY = new THREE.Color(0xbcd6ff);
const RAIN_COLOR_NIGHT = new THREE.Color(0x9fb6ff);
const SNOW_COLOR_DAY = new THREE.Color(0xffffff);
const SNOW_COLOR_NIGHT = new THREE.Color(0xe6ecff);

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

const rainVert = /* glsl */ `
  uniform float uTime;
  uniform float uFall;
  uniform float uStreak;
  uniform float uWind;
  attribute float aSide;   // 0.0 = head (drop tip), 1.0 = tail (trailing top)
  attribute float aRand;   // per-drop 0..1
  varying float vSide;
  varying float vDepth;
  void main() {
    vec3 pos = position;
    float speed = uFall * (0.6 + aRand * 0.9);
    float y = pos.y - (uTime * speed + aRand * RANGE_Y);
    y = mod(y + RANGE_Y * 0.5, RANGE_Y) - RANGE_Y * 0.5;
    float streak = uStreak * (0.7 + aRand * 0.7);
    float yy = y + aSide * streak;
    float xx = pos.x + aSide * streak * uWind;
    vec4 mv = modelViewMatrix * vec4(xx, yy, pos.z, 1.0);
    gl_Position = projectionMatrix * mv;
    vSide = aSide;
    vDepth = -mv.z;
  }
`.replace('RANGE_Y', RANGE_Y.toFixed(1));

const rainFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vSide;
  varying float vDepth;
  void main() {
    float head = mix(0.95, 0.1, vSide);            // tip bright, tail faint
    float fog = smoothstep(600.0, 120.0, vDepth);  // far drops fade out
    gl_FragColor = vec4(uColor, uOpacity * head * (0.25 + 0.75 * fog));
  }
`;

const snowVert = /* glsl */ `
  uniform float uTime;
  uniform float uFall;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aRand;
  attribute float aPhase;
  varying float vDepth;
  void main() {
    vec3 pos = position;
    float speed = uFall * (0.5 + aRand);
    float y = pos.y - (uTime * speed + aRand * RANGE_Y);
    y = mod(y + RANGE_Y * 0.5, RANGE_Y) - RANGE_Y * 0.5;
    float sway = sin(uTime * 0.7 + aPhase) * 14.0 * (0.4 + aRand);
    vec4 mv = modelViewMatrix * vec4(pos.x + sway, y, pos.z, 1.0);
    gl_Position = projectionMatrix * mv;
    vDepth = -mv.z;
    gl_PointSize = uSize * (0.5 + aRand * 1.1) * uPixelRatio * (320.0 / vDepth);
  }
`.replace('RANGE_Y', RANGE_Y.toFixed(1));

const snowFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d);
    float fog = smoothstep(640.0, 120.0, vDepth);
    gl_FragColor = vec4(uColor, a * uOpacity * (0.3 + 0.7 * fog));
  }
`;

function buildRain() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_RAIN * 2 * 3);
  const side = new Float32Array(MAX_RAIN * 2);
  const rnd = new Float32Array(MAX_RAIN * 2);

  for (let i = 0; i < MAX_RAIN; i += 1) {
    const x = rand(-SPREAD_X, SPREAD_X);
    const y = rand(-RANGE_Y * 0.5, RANGE_Y * 0.5);
    const z = rand(Z_FAR, Z_NEAR);
    const r = Math.random();
    for (let s = 0; s < 2; s += 1) {
      const v = i * 2 + s;
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = z;
      side[v] = s; // 0 = head, 1 = tail
      rnd[v] = r;
    }
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: rainVert,
    fragmentShader: rainFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uFall: { value: 420 },
      uStreak: { value: 34 },
      uWind: { value: 0.18 },
      uColor: { value: RAIN_COLOR_DAY.clone() },
      uOpacity: { value: 0.85 }
    }
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}

function buildSnow(pixelRatio) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_SNOW * 3);
  const rnd = new Float32Array(MAX_SNOW);
  const phase = new Float32Array(MAX_SNOW);

  for (let i = 0; i < MAX_SNOW; i += 1) {
    pos[i * 3] = rand(-SPREAD_X, SPREAD_X);
    pos[i * 3 + 1] = rand(-RANGE_Y * 0.5, RANGE_Y * 0.5);
    pos[i * 3 + 2] = rand(Z_FAR, Z_NEAR);
    rnd[i] = Math.random();
    phase[i] = rand(0, Math.PI * 2);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: snowVert,
    fragmentShader: snowFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uFall: { value: 70 },
      uSize: { value: 26 },
      uPixelRatio: { value: pixelRatio },
      uColor: { value: SNOW_COLOR_DAY.clone() },
      uOpacity: { value: 0.95 }
    }
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  return points;
}

// Plane (in world Z) the sun sits on. It's behind the precipitation volume so
// rain/snow streak in front of it for depth.
const SUN_Z = -90;

function radialTexture(stops, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  for (const [offset, color] of stops) {
    g.addColorStop(offset, color);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function raysTexture(size = 512) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const c = size / 2;
  const count = 14;
  ctx.translate(c, c);
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const g = ctx.createLinearGradient(0, 0, 0, -c);
    g.addColorStop(0, 'rgba(255,220,140,0.0)');
    g.addColorStop(0.25, 'rgba(255,225,150,0.35)');
    g.addColorStop(1, 'rgba(255,210,120,0.0)');
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-size * 0.03, 0);
    ctx.lineTo(0, -c);
    ctx.lineTo(size * 0.03, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildSun() {
  const group = new THREE.Group();

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(255,240,190,0.85)'],
        [0.18, 'rgba(255,210,120,0.45)'],
        [0.45, 'rgba(255,180,80,0.14)'],
        [1, 'rgba(255,170,70,0.0)']
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
  );
  halo.scale.set(420, 420, 1);

  const rays = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: raysTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
  );
  rays.scale.set(560, 560, 1);

  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: radialTexture([
        [0, 'rgba(255,255,248,1)'],
        [0.42, 'rgba(255,242,185,1)'],
        [0.62, 'rgba(255,205,95,0.95)'],
        [0.78, 'rgba(255,175,60,0.35)'],
        [1, 'rgba(255,160,50,0.0)']
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    })
  );
  core.scale.set(150, 150, 1);

  group.add(rays);
  group.add(halo);
  group.add(core);
  group.position.z = SUN_Z;

  group.userData = { halo, rays, core };
  return group;
}

export function createPrecip(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    58,
    window.innerWidth / window.innerHeight,
    1,
    2000
  );
  camera.position.set(0, 0, 360);
  camera.lookAt(0, 0, 0);

  const rain = buildRain();
  const snow = buildSnow(pixelRatio);
  const sun = buildSun();
  scene.add(rain);
  scene.add(snow);
  scene.add(sun);

  let type = 'none';
  let night = false;
  let raf = 0;
  let sunOpacity = 1; // current, eased
  let sunTarget = 1; // 0 at night, 1 by day
  const clock = new THREE.Clock();

  // Place the sun in the upper-right of the view, on its Z plane.
  const positionSun = () => {
    const fovRad = (camera.fov * Math.PI) / 180;
    const dist = camera.position.z - SUN_Z;
    const halfH = Math.tan(fovRad / 2) * dist;
    const halfW = halfH * camera.aspect;
    sun.position.set(halfW * 0.62, halfH * 0.6, SUN_Z);
  };

  const { halo, rays, core } = sun.userData;

  const tick = () => {
    const t = clock.getElapsedTime();
    if (rain.visible) {
      rain.material.uniforms.uTime.value = t;
    }
    if (snow.visible) {
      snow.material.uniforms.uTime.value = t;
    }

    // Ease the sun in/out and give it some life.
    sunOpacity += (sunTarget - sunOpacity) * 0.04;
    sun.visible = sunOpacity > 0.01;
    if (sun.visible) {
      const pulse = 1 + Math.sin(t * 1.4) * 0.025;
      halo.scale.set(420 * pulse, 420 * pulse, 1);
      core.scale.set(150 * (1 + Math.sin(t * 2.1) * 0.02), 150, 1);
      rays.material.rotation = t * 0.06;
      halo.material.opacity = sunOpacity;
      core.material.opacity = sunOpacity;
      rays.material.opacity = sunOpacity * (0.7 + Math.sin(t * 0.9) * 0.15);
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };

  const applyColors = () => {
    rain.material.uniforms.uColor.value.copy(
      night ? RAIN_COLOR_NIGHT : RAIN_COLOR_DAY
    );
    snow.material.uniforms.uColor.value.copy(
      night ? SNOW_COLOR_NIGHT : SNOW_COLOR_DAY
    );
  };

  positionSun();
  clock.start();
  tick();

  return {
    setType(nextType, intensity) {
      type = nextType || 'none';
      const i = Math.max(0, intensity || 0);

      if (type === 'rain') {
        const drops = Math.min(MAX_RAIN, Math.max(250, Math.round(i * 7)));
        rain.geometry.setDrawRange(0, drops * 2);
        rain.visible = true;
        snow.visible = false;
      } else if (type === 'snow') {
        const flakes = Math.min(MAX_SNOW, Math.max(150, Math.round(i * 6)));
        snow.geometry.setDrawRange(0, flakes);
        snow.visible = true;
        rain.visible = false;
      } else {
        rain.visible = false;
        snow.visible = false;
      }
    },

    setNight(value) {
      night = !!value;
      sunTarget = night ? 0 : 1;
      applyColors();
    },

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      positionSun();
      renderer.setSize(w, h, false);
    },

    dispose() {
      cancelAnimationFrame(raf);
      rain.geometry.dispose();
      rain.material.dispose();
      snow.geometry.dispose();
      snow.material.dispose();
      [halo, rays, core].forEach((s) => {
        s.material.map?.dispose();
        s.material.dispose();
      });
      renderer.dispose();
    }
  };
}
