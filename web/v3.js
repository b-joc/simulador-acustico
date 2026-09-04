(() => {
  'use strict';

  const presets = window.ACOUSTIC_PRESETS;
  if (!presets) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const roomCards = $('#roomPresetCards');
  const materialCards = $('#materialPresetCards');
  const widthInput = $('#width');
  const lengthInput = $('#length');
  const heightInput = $('#height');
  const absorptionInput = $('#absorption');
  const roomTitle = $('#roomTitle');

  const roomVolume = room => room.width * room.length * room.height;
  const formatNumber = value => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value);

  function dispatchInput(node) {
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function currentRoomMatch() {
    const w = Number(widthInput.value);
    const l = Number(lengthInput.value);
    const h = Number(heightInput.value);
    return presets.rooms.find(room => room.width === w && room.length === l && room.height === h) || null;
  }

  function currentMaterialMatch() {
    const alpha = Number(absorptionInput.value);
    return presets.materials.find(material => Math.abs(material.absorption - alpha) < 1e-9) || null;
  }

  function syncPresetState() {
    const room = currentRoomMatch();
    const material = currentMaterialMatch();
    $$('.preset-card-v3[data-room-id]', roomCards).forEach(card => {
      card.classList.toggle('active', room?.id === card.dataset.roomId);
    });
    $$('.preset-card-v3[data-material-id]', materialCards).forEach(card => {
      card.classList.toggle('active', material?.id === card.dataset.materialId);
    });
    if (roomTitle) roomTitle.textContent = room ? room.label : 'Recinto rectangular personalizado';
  }

  function renderRoomCards() {
    roomCards.innerHTML = presets.rooms.map(room => `
      <button class="preset-card-v3" type="button" data-room-id="${room.id}">
        <span class="preset-card-title"><strong>${room.label}</strong><span class="preset-badge">ROOM</span></span>
        <span class="preset-data">${room.width} × ${room.length} × ${room.height} m</span>
        <p>${room.description}</p>
        <span class="preset-volume">V = ${formatNumber(roomVolume(room))} m³</span>
      </button>
    `).join('');

    $$('.preset-card-v3[data-room-id]', roomCards).forEach(card => {
      card.addEventListener('click', () => {
        const room = presets.rooms.find(item => item.id === card.dataset.roomId);
        if (!room) return;
        widthInput.value = room.width;
        lengthInput.value = room.length;
        heightInput.value = room.height;
        dispatchInput(widthInput);
        dispatchInput(lengthInput);
        dispatchInput(heightInput);
        syncPresetState();
        document.querySelector('#simulador .sim-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function renderMaterialCards() {
    materialCards.innerHTML = presets.materials.map(material => `
      <button class="preset-card-v3" type="button" data-material-id="${material.id}">
        <span class="preset-card-title"><strong>${material.label}</strong><span class="preset-badge">α</span></span>
        <span class="preset-data">α = ${material.absorption.toFixed(2)}</span>
        <p>${material.description}</p>
        <span class="preset-volume">Coeficiente uniforme de referencia</span>
      </button>
    `).join('');

    $$('.preset-card-v3[data-material-id]', materialCards).forEach(card => {
      card.addEventListener('click', () => {
        const material = presets.materials.find(item => item.id === card.dataset.materialId);
        if (!material) return;
        absorptionInput.value = material.absorption;
        dispatchInput(absorptionInput);
        syncPresetState();
      });
    });
  }

  [widthInput, lengthInput, heightInput, absorptionInput].forEach(node => {
    node?.addEventListener('input', syncPresetState);
  });

  // -------------------------------------------------------------------------
  // Rich result readouts. These only visualize values already returned by API.
  // -------------------------------------------------------------------------
  const metricNodes = Object.fromEntries($$('[data-metric]').map(node => [node.dataset.metric, node]));

  function metricValue(key) {
    const value = Number(metricNodes[key]?.textContent);
    return Number.isFinite(value) ? value : null;
  }

  function updateResultBars() {
    const times = ['edt', 't20', 't30'].map(metricValue).filter(Number.isFinite);
    const timeMax = times.length ? Math.max(0.5, ...times) * 1.12 : 1;

    $$('.metric-bar-row[data-bar-key]').forEach(row => {
      const key = row.dataset.barKey;
      const value = metricValue(key);
      const bar = $('i > b', row);
      const label = $('strong', row);
      if (value === null) {
        bar.style.width = '0%';
        if (row.classList.contains('diverging')) bar.style.left = '50%';
        label.textContent = '—';
        return;
      }

      if (key === 'edt' || key === 't20' || key === 't30') {
        bar.style.width = `${Math.min(100, Math.max(0, value / timeMax * 100))}%`;
        label.textContent = `${value.toFixed(2)} s`;
      } else if (key === 'd50') {
        bar.style.width = `${Math.min(100, Math.max(0, value))}%`;
        label.textContent = `${value.toFixed(1)} %`;
      } else {
        const extent = 12;
        const clamped = Math.max(-extent, Math.min(extent, value));
        const width = Math.abs(clamped) / (2 * extent) * 100;
        bar.style.width = `${width}%`;
        bar.style.left = clamped >= 0 ? '50%' : `${50 - width}%`;
        label.textContent = `${value.toFixed(2)} dB`;
      }
    });
  }

  const metricObserver = new MutationObserver(updateResultBars);
  Object.values(metricNodes).forEach(node => metricObserver.observe(node, { childList: true, characterData: true, subtree: true }));

  // -------------------------------------------------------------------------
  // A/B comparison: two real API calls, no acoustic model in JavaScript.
  // -------------------------------------------------------------------------
  const compare = {
    roomA: $('#compareRoomA'),
    roomB: $('#compareRoomB'),
    materialA: $('#compareMaterialA'),
    materialB: $('#compareMaterialB'),
    readoutA: $('#compareReadoutA'),
    readoutB: $('#compareReadoutB'),
    button: $('#compareButton'),
    status: $('#compareStatus'),
    chart: $('#compareEdcChart'),
    empty: $('#compareEdcEmpty'),
    band: $('#compareBand'),
    body: $('#compareMetricsBody'),
    audioA: $('#compareAudioA'),
    audioB: $('#compareAudioB'),
    placeholderA: $('#compareAudioPlaceholderA'),
    placeholderB: $('#compareAudioPlaceholderB')
  };

  let compareAudioUrlA = null;
  let compareAudioUrlB = null;
  let lastCompare = null;

  function populateCompareSelectors() {
    const roomOptions = presets.rooms.map(room => `<option value="${room.id}">${room.label}</option>`).join('');
    const matOptions = presets.materials.map(material => `<option value="${material.id}">${material.label} · α ${material.absorption.toFixed(2)}</option>`).join('');
    compare.roomA.innerHTML = roomOptions;
    compare.roomB.innerHTML = roomOptions;
    compare.materialA.innerHTML = matOptions;
    compare.materialB.innerHTML = matOptions;

    compare.roomA.value = 'tec-arts';
    compare.roomB.value = 'tec-arts';
    compare.materialA.value = 'concrete-glass';
    compare.materialB.value = 'occupied-seats';
    updateCompareReadouts();
  }

  function selectedById(items, id) {
    return items.find(item => item.id === id) || items[0];
  }

  function updateCompareReadouts() {
    const aRoom = selectedById(presets.rooms, compare.roomA.value);
    const bRoom = selectedById(presets.rooms, compare.roomB.value);
    const aMat = selectedById(presets.materials, compare.materialA.value);
    const bMat = selectedById(presets.materials, compare.materialB.value);
    compare.readoutA.textContent = `${aRoom.width} × ${aRoom.length} × ${aRoom.height} m · V ${formatNumber(roomVolume(aRoom))} m³ · α ${aMat.absorption.toFixed(2)}`;
    compare.readoutB.textContent = `${bRoom.width} × ${bRoom.length} × ${bRoom.height} m · V ${formatNumber(roomVolume(bRoom))} m³ · α ${bMat.absorption.toFixed(2)}`;
  }

  [compare.roomA, compare.roomB, compare.materialA, compare.materialB].forEach(node => node.addEventListener('change', updateCompareReadouts));

  function getSelectedSource() {
    return document.querySelector('input[name="source"]:checked')?.value || 'voice';
  }

  function buildCompareForm(room, material) {
    const source = getSelectedSource();
    const form = new FormData();
    form.append('source', source);
    form.append('width_m', room.width);
    form.append('length_m', room.length);
    form.append('height_m', room.height);
    form.append('absorption', material.absorption);
    form.append('source_power_db', $('#sourcePower').value);
    form.append('max_order', $('#maxOrder').value);
    form.append('analysis_frequency_hz', $('#analysisFrequency').value);
    if (source === 'upload') {
      const file = $('#audioFile').files[0];
      if (!file) throw new Error('Selecciona un WAV, M4A o MP3 antes de comparar con audio propio.');
      form.append('audio_file', file);
    }
    return form;
  }

  async function requestSimulation(room, material) {
    const response = await fetch('/api/simulate', { method: 'POST', body: buildCompareForm(room, material) });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        detail = body.detail || body.message || detail;
      } catch (_) { /* ignore */ }
      throw new Error(detail);
    }
    return response.json();
  }

  async function attachAudio(audioEl, placeholder, url, slot) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`No se pudo descargar el audio ${slot}.`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength <= 44) throw new Error(`El audio ${slot} está vacío.`);
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    if (slot === 'A') {
      if (compareAudioUrlA) URL.revokeObjectURL(compareAudioUrlA);
      compareAudioUrlA = objectUrl;
    } else {
      if (compareAudioUrlB) URL.revokeObjectURL(compareAudioUrlB);
      compareAudioUrlB = objectUrl;
    }
    audioEl.src = objectUrl;
    audioEl.load();
    placeholder.textContent = 'Audio generado por pyroomacoustics';
  }

  function normalizeEdc(result) {
    const edc = result?.edc || {};
    return {
      values: Array.isArray(edc.db) ? edc.db : [],
      fs: Number(edc.fs || result?.fs || 44100)
    };
  }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function canvasContext(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function downsampleWithIndex(values, maxPoints) {
    if (values.length <= maxPoints) return values.map((v, i) => [i, Number(v)]);
    const step = values.length / maxPoints;
    const out = [];
    for (let i = 0; i < maxPoints; i++) {
      const index = Math.floor(i * step);
      out.push([index, Number(values[index])]);
    }
    return out;
  }

  function drawCompareEdc(resultA, resultB) {
    const a = normalizeEdc(resultA);
    const b = normalizeEdc(resultB);
    if (!a.values.length || !b.values.length) {
      compare.empty.hidden = false;
      return;
    }
    compare.empty.hidden = true;
    const { ctx, width, height } = canvasContext(compare.chart);
    const pad = { l: 48, r: 18, t: 18, b: 34 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const minY = -65, maxY = 2;
    const maxDuration = Math.max(a.values.length / a.fs, b.values.length / b.fs, 0.001);

    ctx.clearRect(0, 0, width, height);
    const grid = css('--chart-grid');
    const axis = css('--chart-axis');
    const axisStrong = css('--chart-axis-strong');
    ctx.strokeStyle = grid;
    ctx.fillStyle = axis;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const x = pad.l + plotW * i / 5;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
      ctx.fillText((maxDuration * i / 5).toFixed(maxDuration < 1 ? 2 : 1), x - 9, height - 11);
    }
    [-60, -50, -40, -30, -20, -10, 0].forEach(db => {
      const y = pad.t + (maxY - db) / (maxY - minY) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke();
      ctx.fillText(String(db), 8, y + 3);
    });

    ctx.save();
    ctx.strokeStyle = axisStrong;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.stroke();
    ctx.restore();

    const draw = (series, color) => {
      const points = downsampleWithIndex(series.values, Math.max(300, Math.floor(plotW * 1.4)));
      ctx.beginPath();
      points.forEach(([index, raw], idx) => {
        const time = index / series.fs;
        const value = Math.max(minY, Math.min(maxY, Number.isFinite(raw) ? raw : minY));
        const x = pad.l + (time / maxDuration) * plotW;
        const y = pad.t + (maxY - value) / (maxY - minY) * plotH;
        if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    };

    draw(a, css('--blue'));
    draw(b, css('--orange'));
  }

  const metricMeta = [
    ['edt', 'EDT', 's', 2], ['t20', 'T20', 's', 2], ['t30', 'T30', 's', 2],
    ['c50', 'C50', 'dB', 2], ['c80', 'C80', 'dB', 2], ['d50', 'D50', '%', 1], ['Lp', 'Lp', 'dB', 1]
  ];

  function renderCompareTable(a, b) {
    compare.body.innerHTML = metricMeta.map(([key, label, unit, decimals]) => {
      const av = Number(a?.metrics?.[key]);
      const bv = Number(b?.metrics?.[key]);
      const aText = Number.isFinite(av) ? `${av.toFixed(decimals)} ${unit}` : '—';
      const bText = Number.isFinite(bv) ? `${bv.toFixed(decimals)} ${unit}` : '—';
      const delta = Number.isFinite(av) && Number.isFinite(bv) ? `${(bv - av >= 0 ? '+' : '')}${(bv - av).toFixed(decimals)} ${unit}` : '—';
      return `<tr><td>${label}</td><td>${aText}</td><td>${bText}</td><td>${delta}</td></tr>`;
    }).join('');
  }

  compare.button.addEventListener('click', async () => {
    const roomA = selectedById(presets.rooms, compare.roomA.value);
    const roomB = selectedById(presets.rooms, compare.roomB.value);
    const matA = selectedById(presets.materials, compare.materialA.value);
    const matB = selectedById(presets.materials, compare.materialB.value);
    compare.button.disabled = true;
    compare.status.textContent = 'Simulando espacio A con pyroomacoustics…';
    try {
      const resultA = await requestSimulation(roomA, matA);
      compare.status.textContent = 'Simulando espacio B con pyroomacoustics…';
      const resultB = await requestSimulation(roomB, matB);
      lastCompare = { resultA, resultB };
      compare.status.textContent = 'Cargando auralizaciones A/B…';
      await Promise.all([
        attachAudio(compare.audioA, compare.placeholderA, resultA.processed_audio_url, 'A'),
        attachAudio(compare.audioB, compare.placeholderB, resultB.processed_audio_url, 'B')
      ]);
      renderCompareTable(resultA, resultB);
      drawCompareEdc(resultA, resultB);
      compare.band.textContent = `${$('#analysisFrequency').value} Hz`;
      compare.status.textContent = 'Comparación completada. Ambos casos provienen del motor Python.';
    } catch (error) {
      console.error(error);
      compare.status.textContent = `No fue posible completar la comparación: ${error.message}`;
    } finally {
      compare.button.disabled = false;
    }
  });

  window.addEventListener('acoustic-theme-change', () => {
    if (lastCompare) drawCompareEdc(lastCompare.resultA, lastCompare.resultB);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (lastCompare) drawCompareEdc(lastCompare.resultA, lastCompare.resultB);
    }, 140);
  });

  renderRoomCards();
  renderMaterialCards();
  populateCompareSelectors();
  syncPresetState();
  updateResultBars();
})();
