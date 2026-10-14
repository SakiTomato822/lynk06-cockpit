// Optional environment layer for the 06 cockpit demo. It adds its own UI and
// DOM effects, then decorates CarScene.environment without changing the model.
(() => {
  const labels = {
    clear: '晴天',
    cloud: '多云',
    rain: '雨天',
    fog: '雾天',
    snow: '雪地',
  };
  const weatherText = {
    clear: '晴朗 · 24°',
    cloud: '多云 · 22°',
    rain: '雨天 · 22°',
    fog: '雾天 · 19°',
    snow: '降雪 · 0°',
  };
  const state = { kind: 'clear', speed: 0, rainLevel: 0, phase: 0, timer: 0 };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let layers = null;
  let syncingRain = false;
  let wrappedEnvironment = null;

  const clampSpeed = value => Math.max(0, Math.min(120, Number(value) || 0));
  const normalizeKind = kind => Object.prototype.hasOwnProperty.call(labels, kind) ? kind : 'clear';

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createLayers() {
    const scene = document.querySelector('.scene');
    if (!scene) return;
    const backdrop = makeElement('div', 'environment-backdrop');
    const ground = makeElement('div', 'environment-ground');
    const tracks = makeElement('div', 'environment-tracks');
    const weather = makeElement('div', 'environment-weather-fx');
    const atmosphere = makeElement('div', 'environment-atmosphere');
    for (const layer of [backdrop, ground, tracks, weather, atmosphere]) {
      layer.setAttribute('aria-hidden', 'true');
      scene.append(layer);
    }
    layers = { scene, backdrop, ground, tracks, weather, atmosphere };
  }

  function createControls() {
    const explanation = document.querySelector('.explanation');
    if (!explanation || document.querySelector('#environment-demo')) return null;

    const panel = makeElement('section', 'environment-panel');
    panel.id = 'environment-demo';
    panel.setAttribute('aria-label', '场景环境设置');

    const heading = makeElement('div', 'environment-heading');
    heading.append(makeElement('span', 'environment-kicker', 'ENVIRONMENT'));
    heading.append(makeElement('strong', 'environment-status', '晴天 · 静止'));

    const choices = makeElement('div', 'environment-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', '环境状态');
    for (const kind of Object.keys(labels)) {
      const button = makeElement('button', 'environment-choice', labels[kind]);
      button.type = 'button';
      button.dataset.environment = kind;
      button.setAttribute('aria-pressed', String(kind === state.kind));
      button.addEventListener('click', () => requestEnvironment(kind, state.speed));
      choices.append(button);
    }

    const speedControl = makeElement('label', 'environment-speed');
    speedControl.append(makeElement('span', 'environment-speed-label', '车速'));
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '120';
    range.step = '5';
    range.value = '0';
    range.setAttribute('aria-label', '模拟车速，单位千米每小时');
    const output = document.createElement('output');
    output.className = 'environment-speed-value';
    output.value = '0 km/h';
    output.textContent = '0 km/h';
    range.addEventListener('input', () => requestEnvironment(state.kind, range.value));
    speedControl.append(range, output);

    panel.append(heading, choices, speedControl);
    explanation.parentNode.insertBefore(panel, explanation);
    return { panel, range, output };
  }

  const controls = createControls();
  createLayers();

  function updateHeader() {
    const weather = document.querySelector('#weather');
    if (!weather) return;
    if (state.kind === 'rain' && state.rainLevel > 0) {
      weather.textContent = `${['', '小雨', '中雨', '大雨'][state.rainLevel]} · 22°`;
    } else {
      weather.textContent = weatherText[state.kind];
    }
  }

  function syncRainControl() {
    const rainInput = document.querySelector('#rain-level');
    if (!rainInput) return;
    const wanted = state.kind === 'rain' ? (state.rainLevel || 2) : 0;
    state.rainLevel = wanted;
    if (Number(rainInput.value) === wanted) return;
    syncingRain = true;
    rainInput.value = String(wanted);
    rainInput.dispatchEvent(new Event('input', { bubbles: true }));
    syncingRain = false;
  }

  function renderEnvironment() {
    if (layers) {
      layers.scene.dataset.environment = state.kind;
      layers.scene.style.setProperty('--environment-speed', String(state.speed / 120));
      const nativeTracks = state.kind === 'rain' || state.kind === 'snow';
      layers.tracks.style.setProperty('--environment-trail-opacity', String(state.speed > 2 && !nativeTracks ? Math.min(.62, .14 + state.speed / 240) : 0));
    }
    if (controls) {
      controls.panel.querySelectorAll('[data-environment]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.environment === state.kind));
      });
      controls.range.value = String(state.speed);
      controls.output.value = `${state.speed} km/h`;
      controls.output.textContent = `${state.speed} km/h`;
      controls.panel.querySelector('.environment-status').textContent = `${labels[state.kind]} · ${state.speed} km/h`;
    }
    updateHeader();
  }

  function animateTraces() {
    if (document.hidden || state.speed <= 2 || state.kind === 'rain' || state.kind === 'snow' || reduceMotion?.matches || !layers) {
      window.clearInterval(state.timer);
      state.timer = 0;
      return;
    }
    state.phase = (state.phase + Math.max(1, state.speed / 30)) % 20;
    layers.tracks.style.setProperty('--environment-trail-offset', `${state.phase}px`);
  }

  function setEnvironmentState(kind, speed) {
    state.kind = normalizeKind(kind);
    state.speed = clampSpeed(speed);
    if (state.kind !== 'rain') state.rainLevel = 0;
    renderEnvironment();
    syncRainControl();
    window.clearInterval(state.timer);
    state.timer = 0;
    if (state.speed > 2 && state.kind !== 'rain' && state.kind !== 'snow' && !document.hidden && !reduceMotion?.matches) {
      animateTraces();
      state.timer = window.setInterval(animateTraces, 66);
    }
  }

  function requestEnvironment(kind, speed) {
    const scene = window.CarScene;
    if (scene && typeof scene.environment === 'function') {
      scene.environment(kind, speed);
    } else {
      setEnvironmentState(kind, speed);
    }
  }

  function patchCarScene() {
    const scene = window.CarScene;
    if (!scene || typeof scene.environment !== 'function' || scene.environment === wrappedEnvironment) return;
    const original = scene.environment;
    wrappedEnvironment = function (kind, speed = state.speed) {
      const normalizedKind = normalizeKind(kind);
      const normalizedSpeed = clampSpeed(speed);
      let result;
      try {
        result = original.call(this, normalizedKind, normalizedSpeed);
      } finally {
        setEnvironmentState(normalizedKind, normalizedSpeed);
      }
      return result;
    };
    Object.defineProperty(wrappedEnvironment, 'original', { value: original });
    scene.environment = wrappedEnvironment;
    scene.environment(state.kind, state.speed);
  }

  const rainInput = document.querySelector('#rain-level');
  rainInput?.addEventListener('input', () => {
    if (syncingRain) return;
    const level = Math.max(0, Math.min(3, Number(rainInput.value) || 0));
    if (level > 0) {
      state.rainLevel = level;
      requestEnvironment('rain', state.speed);
    } else if (state.kind === 'rain') {
      state.rainLevel = 0;
      requestEnvironment('clear', state.speed);
    }
  });

  window.addEventListener('car-ready', patchCarScene);
  document.addEventListener('visibilitychange', () => {
    window.clearInterval(state.timer);
    state.timer = 0;
    if (!document.hidden && state.speed > 2 && state.kind !== 'rain' && state.kind !== 'snow' && !reduceMotion?.matches) {
      animateTraces();
      state.timer = window.setInterval(animateTraces, 66);
    }
  });
  if (window.CarScene) patchCarScene();
  else renderEnvironment();

  window.CockpitEnvironment = {
    environment: requestEnvironment,
    get state() { return { kind: state.kind, speed: state.speed }; },
  };
})();
