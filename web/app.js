(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Frontend contract
  // ---------------------------------------------------------------------------
  // Expected backend endpoints:
  //   GET  /api/health
  //   POST /api/simulate        (multipart/form-data)
  //
  // Expected /api/simulate JSON response:
  // {
  //   "simulation_id": "...",
  //   "fs": 44100,
  //   "processed_audio_url": "/api/results/<id>/processed.wav",
  //   "metrics": {"edt":1.2,"t20":1.4,"t30":1.5,"c50":2.1,"c80":3.4,"d50":61,"Lp":82},
  //   "rir": {"samples":[...], "fs":44100},
  //   "edc": {"db":[...], "fs":44100, "frequency_hz":1000}
  // }
  //
  // The frontend deliberately contains NO acoustic simulation code.

  const API_BASE = '';
  const EXAMPLES = {
    voice: 'https://raw.githubusercontent.com/LuAViVA/Proyecto-Acustica/97c3b02797b7fbf216960295b8ea2b6303fdc51e/voz.wav',
    sax: 'https://raw.githubusercontent.com/LuAViVA/Proyecto-Acustica/97c3b02797b7fbf216960295b8ea2b6303fdc51e/saxof%C3%B3n.wav'
  };

  const DEFAULTS = {
    source: 'voice',
    width: 18,
    length: 30,
    height: 7.5,
    absorption: 0.50,
    sourcePower: 100,
    maxOrder: 3,
    analysisFrequency: 1000
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const els = {
    themeToggle: $('#themeToggle'),
    engineStatus: $('#engineStatus'),
    engineStatusText: $('#engineStatusText'),
    sourceRadios: $$('input[name="source"]'),
    sourceOptions: $$('.source-option'),
    uploadBox: $('#uploadBox'),
    audioFile: $('#audioFile'),
    width: $('#width'),
    length: $('#length'),
    height: $('#height'),
    volumeValue: $('#volumeValue'),
    absorption: $('#absorption'),
    absorptionOutput: $('#absorptionOutput'),
    sourcePower: $('#sourcePower'),
    powerOutput: $('#powerOutput'),
    maxOrder: $('#maxOrder'),
    orderOutput: $('#orderOutput'),
    analysisFrequency: $('#analysisFrequency'),
    resetButton: $('#resetButton'),
    simulateButton: $('#simulateButton'),
    simulateButtonLabel: $('#simulateButtonLabel'),
    formMessage: $('#formMessage'),
    dryAudio: $('#dryAudio'),
    wetAudio: $('#wetAudio'),
    wetAudioPlaceholder: $('#wetAudioPlaceholder'),
    metrics: $$('[data-metric]'),
    rirChart: $('#rirChart'),
    edcChart: $('#edcChart'),
    rirEmpty: $('#rirEmpty'),
    edcEmpty: $('#edcEmpty'),
    rirDuration: $('#rirDuration'),
    edcBand: $('#edcBand'),
    heroWave: $('#heroWave'),
    infoDialog: $('#infoDialog'),
    dialogContent: $('#dialogContent'),
    dialogClose: $('#dialogClose')
  };

  let selectedSource = DEFAULTS.source;
  let uploadObjectUrl = null;
  let processedObjectUrl = null;
  let engineOnline = false;

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  const storedTheme = localStorage.getItem('acoustic-theme');
  if (storedTheme === 'light' || storedTheme === 'dark') {
    document.documentElement.dataset.theme = storedTheme;
  }

  els.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('acoustic-theme', next);
    requestAnimationFrame(drawHeroWave);
    if (!els.rirEmpty.hidden) clearCanvas(els.rirChart);
    if (!els.edcEmpty.hidden) clearCanvas(els.edcChart);
  });

  // ---------------------------------------------------------------------------
  // Source selection and dry audio
  // ---------------------------------------------------------------------------
  function updateSourceSelection(value) {
    selectedSource = value;
    els.sourceOptions.forEach(option => {
      const radio = $('input[name="source"]', option);
      option.classList.toggle('active', radio.value === value);
    });
    els.uploadBox.hidden = value !== 'upload';
    resetProcessedAudio();
    setDryAudio();
    clearResults();
  }

  els.sourceRadios.forEach(radio => {
    radio.addEventListener('change', () => updateSourceSelection(radio.value));
  });

  els.audioFile.addEventListener('change', () => {
    if (uploadObjectUrl) URL.revokeObjectURL(uploadObjectUrl);
    const file = els.audioFile.files[0];
    uploadObjectUrl = file ? URL.createObjectURL(file) : null;
    setDryAudio();
    clearResults();
  });

  function setDryAudio() {
    if (selectedSource === 'voice') {
      els.dryAudio.src = EXAMPLES.voice;
    } else if (selectedSource === 'sax') {
      els.dryAudio.src = EXAMPLES.sax;
    } else if (uploadObjectUrl) {
      els.dryAudio.src = uploadObjectUrl;
    } else {
      els.dryAudio.removeAttribute('src');
    }
    els.dryAudio.load();
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------
  function formatVolume(value) {
    return new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value);
  }

  function updateDerivedControls() {
    const volume = Number(els.width.value) * Number(els.length.value) * Number(els.height.value);
    els.volumeValue.textContent = `${formatVolume(volume)} m³`;
    els.absorptionOutput.textContent = Number(els.absorption.value).toFixed(2);
    els.powerOutput.textContent = `${els.sourcePower.value} dB`;
    els.orderOutput.textContent = els.maxOrder.value;
    els.edcBand.textContent = `${els.analysisFrequency.value} Hz`;
  }

  [els.width, els.length, els.height, els.absorption, els.sourcePower, els.maxOrder, els.analysisFrequency]
    .forEach(input => input.addEventListener('input', updateDerivedControls));

  els.resetButton.addEventListener('click', () => {
    els.width.value = DEFAULTS.width;
    els.length.value = DEFAULTS.length;
    els.height.value = DEFAULTS.height;
    els.absorption.value = DEFAULTS.absorption;
    els.sourcePower.value = DEFAULTS.sourcePower;
    els.maxOrder.value = DEFAULTS.maxOrder;
    els.analysisFrequency.value = DEFAULTS.analysisFrequency;
    const defaultRadio = $(`input[name="source"][value="${DEFAULTS.source}"]`);
    defaultRadio.checked = true;
    updateSourceSelection(DEFAULTS.source);
    updateDerivedControls();
    setMessage('Parámetros reiniciados.', '');
  });

  // ---------------------------------------------------------------------------
  // Backend state
  // ---------------------------------------------------------------------------
  async function checkEngine() {
    setEngineState('checking', 'Comprobando motor Python…');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2200);
      const response = await fetch(`${API_BASE}/api/health`, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      engineOnline = true;
      setEngineState('online', 'Motor Python conectado');
    } catch (_) {
      engineOnline = false;
      setEngineState('offline', 'Frontend listo · motor Python pendiente');
    }
  }

  function setEngineState(state, text) {
    els.engineStatus.dataset.state = state;
    els.engineStatusText.textContent = text;
  }

  function setMessage(text, type = '') {
    els.formMessage.textContent = text;
    els.formMessage.className = `form-message ${type}`.trim();
  }

  function setLoading(isLoading) {
    els.simulateButton.disabled = isLoading;
    els.simulateButton.classList.toggle('loading', isLoading);
    els.simulateButtonLabel.textContent = isLoading ? 'Simulando…' : 'Simular';
  }

  // ---------------------------------------------------------------------------
  // Simulation request
  // ---------------------------------------------------------------------------
  els.simulateButton.addEventListener('click', async () => {
    const validationError = validateForm();
    if (validationError) {
      setMessage(validationError, 'error');
      return;
    }

    if (!engineOnline) {
      setMessage('El frontend está listo, pero falta iniciar/conectar la API Python en /api. No se generan resultados aproximados en JavaScript.', 'error');
      return;
    }

    const form = new FormData();
    form.append('source', selectedSource);
    form.append('width_m', els.width.value);
    form.append('length_m', els.length.value);
    form.append('height_m', els.height.value);
    form.append('absorption', els.absorption.value);
    form.append('source_power_db', els.sourcePower.value);
    form.append('max_order', els.maxOrder.value);
    form.append('analysis_frequency_hz', els.analysisFrequency.value);

    if (selectedSource === 'upload') {
      form.append('audio_file', els.audioFile.files[0]);
    }

    setLoading(true);
    setMessage('Ejecutando pyroomacoustics…', '');

    try {
      const response = await fetch(`${API_BASE}/api/simulate`, { method: 'POST', body: form });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          detail = body.detail || body.message || detail;
        } catch (_) { /* no-op */ }
        throw new Error(detail);
      }
      const result = await response.json();
      await renderResult(result);
      setMessage('Simulación completada. Audio, RIR y métricas provienen del motor Python.', 'success');
    } catch (error) {
      console.error(error);
      setMessage(`No fue posible completar la simulación: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  });

  function validateForm() {
    const width = Number(els.width.value);
    const length = Number(els.length.value);
    const height = Number(els.height.value);
    if (width < 10) return 'El ancho debe ser al menos 10 m para mantener los receptores dentro de la sala.';
    if (length < 24) return 'El largo debe ser al menos 24 m para mantener los receptores dentro de la sala.';
    if (height < 3) return 'La altura debe ser al menos 3 m.';
    if (selectedSource === 'upload' && !els.audioFile.files[0]) return 'Selecciona un archivo de audio antes de simular.';
    return '';
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  async function renderResult(result) {
    const metrics = result.metrics || {};
    els.metrics.forEach(node => {
      const key = node.dataset.metric;
      const value = metrics[key];
      node.textContent = Number.isFinite(Number(value)) ? formatMetric(key, Number(value)) : '—';
    });

    if (result.processed_audio_url) {
      await loadProcessedAudio(result.processed_audio_url);
    } else {
      resetProcessedAudio();
      throw new Error('La API completó la simulación, pero no devolvió una URL para el audio procesado.');
    }

    const rir = normalizeSeries(result.rir, result.fs);
    const edc = normalizeSeries(result.edc, result.fs);

    if (rir.values.length) {
      els.rirEmpty.hidden = true;
      drawLineChart(els.rirChart, rir.values, rir.fs, { type: 'rir' });
      els.rirDuration.textContent = `${(rir.values.length / rir.fs).toFixed(2)} s`;
    } else {
      els.rirEmpty.hidden = false;
      clearCanvas(els.rirChart);
      els.rirDuration.textContent = '—';
    }

    if (edc.values.length) {
      els.edcEmpty.hidden = true;
      drawLineChart(els.edcChart, edc.values, edc.fs, { type: 'edc' });
      const band = result.edc?.frequency_hz ?? els.analysisFrequency.value;
      els.edcBand.textContent = `${band} Hz`;
    } else {
      els.edcEmpty.hidden = false;
      clearCanvas(els.edcChart);
    }
  }

  function resetProcessedAudio() {
    if (processedObjectUrl) {
      URL.revokeObjectURL(processedObjectUrl);
      processedObjectUrl = null;
    }
    try { els.wetAudio.pause(); } catch (_) { /* no-op */ }
    els.wetAudio.removeAttribute('src');
    els.wetAudio.load();
    els.wetAudioPlaceholder.hidden = false;
  }

  async function loadProcessedAudio(url) {
    resetProcessedAudio();
    const response = await fetch(resolveApiUrl(url), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`El WAV procesado no pudo descargarse (HTTP ${response.status}).`);
    }

    const audioBytes = await response.arrayBuffer();
    if (audioBytes.byteLength <= 44) {
      throw new Error('El WAV procesado recibido está vacío o incompleto.');
    }

    const blob = new Blob([audioBytes], { type: 'audio/wav' });
    processedObjectUrl = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        els.wetAudio.removeEventListener('loadedmetadata', onReady);
        els.wetAudio.removeEventListener('canplay', onReady);
        els.wetAudio.removeEventListener('error', onError);
        callback(value);
      };
      const onReady = () => finish(resolve);
      const onError = () => finish(reject, new Error('El navegador recibió el WAV, pero no pudo decodificarlo.'));

      els.wetAudio.addEventListener('loadedmetadata', onReady, { once: true });
      els.wetAudio.addEventListener('canplay', onReady, { once: true });
      els.wetAudio.addEventListener('error', onError, { once: true });
      timer = setTimeout(
        () => finish(reject, new Error('El WAV fue generado, pero el navegador tardó demasiado en cargarlo.')),
        8000
      );

      els.wetAudio.src = processedObjectUrl;
      els.wetAudio.load();
    });

    els.wetAudioPlaceholder.hidden = true;
  }

  function normalizeSeries(series, fallbackFs = 44100) {
    if (!series) return { values: [], fs: fallbackFs };
    if (Array.isArray(series)) return { values: series, fs: fallbackFs };
    const values = series.samples || series.db || series.values || [];
    return { values, fs: Number(series.fs || fallbackFs || 44100) };
  }

  function formatMetric(key, value) {
    if (key === 'd50') return value.toFixed(1);
    if (key === 'Lp') return value.toFixed(1);
    if (key === 'c50' || key === 'c80') return value.toFixed(2);
    return value.toFixed(2);
  }

  function clearResults() {
    els.metrics.forEach(node => { node.textContent = '—'; });
    els.rirEmpty.hidden = false;
    els.edcEmpty.hidden = false;
    clearCanvas(els.rirChart);
    clearCanvas(els.edcChart);
    els.rirDuration.textContent = '—';
    resetProcessedAudio();
  }

  function resolveApiUrl(url) {
    if (/^https?:\/\//i.test(url) || url.startsWith('blob:')) return url;
    return `${API_BASE}${url}`;
  }

  // ---------------------------------------------------------------------------
  // Canvas charts — visualization only, no physical calculations
  // ---------------------------------------------------------------------------
  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function clearCanvas(canvas) {
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
  }

  function drawLineChart(canvas, values, fs, options) {
    const { ctx, width, height } = setupCanvas(canvas);
    const pad = { l: 48, r: 18, t: 18, b: 34 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const inkFaint = css('--ink-faint');
    const line = css('--line');
    const signal = options.type === 'edc' ? css('--accent') : css('--blue');

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = line;
    ctx.fillStyle = inkFaint;
    ctx.font = '10px JetBrains Mono, monospace';

    let minY, maxY;
    if (options.type === 'edc') {
      minY = -65; maxY = 2;
    } else {
      const maxAbs = Math.max(...downsample(values.map(v => Math.abs(Number(v) || 0)), 4000), 1e-9);
      minY = -maxAbs; maxY = maxAbs;
    }

    const xTicks = 5;
    const yTicks = options.type === 'edc' ? 6 : 4;
    for (let i = 0; i <= xTicks; i++) {
      const x = pad.l + plotW * (i / xTicks);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
      const t = (values.length / fs) * (i / xTicks);
      ctx.fillText(t.toFixed(t < 1 ? 2 : 1), x - 9, height - 12);
    }
    for (let i = 0; i <= yTicks; i++) {
      const y = pad.t + plotH * (i / yTicks);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
      const label = maxY - (maxY - minY) * (i / yTicks);
      ctx.fillText(options.type === 'edc' ? label.toFixed(0) : label.toFixed(2), 6, y + 3);
    }

    if (options.type === 'edc') {
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = css('--line-strong');
      [-5, -10, -25, -35].forEach(db => {
        const y = pad.t + ((maxY - db) / (maxY - minY)) * plotH;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
      });
      ctx.restore();
    }

    const points = downsampleWithIndex(values, Math.max(350, Math.floor(plotW * 1.4)));
    ctx.beginPath();
    points.forEach(([index, raw], i) => {
      const value = Math.max(minY, Math.min(maxY, Number(raw) || 0));
      const x = pad.l + plotW * (index / Math.max(1, values.length - 1));
      const y = pad.t + ((maxY - value) / (maxY - minY)) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = signal;
    ctx.lineWidth = 1.65;
    ctx.stroke();
  }

  function downsample(values, maxPoints) {
    if (values.length <= maxPoints) return values;
    const step = values.length / maxPoints;
    const out = [];
    for (let i = 0; i < maxPoints; i++) out.push(values[Math.floor(i * step)]);
    return out;
  }

  function downsampleWithIndex(values, maxPoints) {
    if (values.length <= maxPoints) return values.map((v, i) => [i, v]);
    const step = values.length / maxPoints;
    const out = [];
    for (let i = 0; i < maxPoints; i++) {
      const index = Math.floor(i * step);
      out.push([index, values[index]]);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Hero visualization
  // ---------------------------------------------------------------------------
  function drawHeroWave() {
    const canvas = els.heroWave;
    const { ctx, width, height } = setupCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    const grid = css('--line');
    const faint = css('--ink-faint');
    const accent = css('--accent');
    const blue = css('--blue');
    const violet = css('--violet');

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const x = width * (i / 7);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const y = height * (i / 4);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const mid = height * .52;
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, blue);
    grad.addColorStop(.45, violet);
    grad.addColorStop(1, accent);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const n = Math.max(500, Math.floor(width * 1.5));
    for (let i = 0; i < n; i++) {
      const x = width * i / (n - 1);
      const t = i / (n - 1);
      const envelope = Math.exp(-4.6 * t);
      const direct = Math.exp(-Math.pow((t - .075) / .012, 2)) * .86;
      const early = Math.exp(-Math.pow((t - .20) / .028, 2)) * .47 + Math.exp(-Math.pow((t - .29) / .035, 2)) * .30;
      const tail = envelope * (Math.sin(i * .67) * .40 + Math.sin(i * .119) * .28 + Math.sin(i * .043) * .18);
      const y = mid - (direct + early + tail) * height * .31;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = faint;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText('0', 7, height - 8);
    ctx.fillText('t', width - 14, height - 8);
  }

  // ---------------------------------------------------------------------------
  // Theory dialogs / shortcuts
  // ---------------------------------------------------------------------------
  const theorySummaries = {
    'teoria-absorcion': {
      title: 'Coeficiente de absorción α',
      body: 'Controla la fracción promedio de energía acústica que no regresa al recinto como reflexión. En esta primera versión científica se aplica el mismo α a todas las superficies. Un α mayor suele acelerar el decaimiento energético.'
    },
    'teoria-geometria': {
      title: 'Geometría del auditorio',
      body: 'La sala se modela como un paralelepípedo rectangular. Las dimensiones modifican el volumen, las distancias fuente–receptor y los tiempos de llegada de las reflexiones. Los mínimos del frontend mantienen los cinco receptores del modelo dentro del recinto.'
    },
    'teoria-modelo': {
      title: 'ISM + ray tracing',
      body: 'pyroomacoustics combina el método de fuentes imagen para las reflexiones especulares con trazado de rayos para representar mejor el campo tardío. El orden máximo ISM controla cuántas generaciones de fuentes imagen se consideran.'
    },
    'teoria-auralizacion': {
      title: 'Auralización',
      body: 'El audio procesado se obtiene al aplicar la respuesta al impulso del recinto a la señal seca. Conceptualmente, y(t) = x(t) * h(t). La futura API devolverá ese audio directamente desde el motor Python.'
    }
  };

  $$('[data-theory-target]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.theoryTarget;
      const summary = theorySummaries[id];
      if (!summary) return;
      els.dialogContent.innerHTML = `<p class="panel-kicker">Fundamento</p><h3>${summary.title}</h3><p>${summary.body}</p><p><a href="#${id}" id="dialogTheoryLink">Leer explicación completa →</a></p>`;
      els.infoDialog.showModal();
      requestAnimationFrame(() => {
        const link = $('#dialogTheoryLink');
        if (link) link.addEventListener('click', () => els.infoDialog.close());
      });
    });
  });
  els.dialogClose.addEventListener('click', () => els.infoDialog.close());
  els.infoDialog.addEventListener('click', event => {
    const rect = els.infoDialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) els.infoDialog.close();
  });

  // ---------------------------------------------------------------------------
  // Resize handling
  // ---------------------------------------------------------------------------
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      drawHeroWave();
    }, 120);
  });

  // Initial state
  updateSourceSelection(DEFAULTS.source);
  updateDerivedControls();
  drawHeroWave();
  checkEngine();
})();
