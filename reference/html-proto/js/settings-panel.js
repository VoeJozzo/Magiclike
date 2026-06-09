// SETTINGS_PANEL — renders the settings modal. Pulled out of controller.js
// (which was 3.5k lines) on the v1-removal pass; the panel UI is logically
// independent of the input handlers / AI scheduling that live in CONTROLLER.
//
// Depends on: SETTINGS (settings.js), Modal (controller.js — used at runtime
// via SETTINGS_PANEL.show()), and render (render.js — called after each
// onChange so the player sees the effect immediately). All three globals are
// resolved lazily inside function bodies; load order in magiclike_engine.html
// places this file after settings/controller/render but the IIFE's body never
// runs at parse time, so the late references are safe.
//
// Public API: SETTINGS_PANEL.render() to populate #settingsList; .show() to
// also open the modal. Sub-render functions are private to this IIFE.
const SETTINGS_PANEL = (function() {

const ROW_STYLE    = 'display:flex;flex-direction:column;gap:4px';
const LABEL_STYLE  = 'color:#ccd;font-size:12px;font-weight:bold;letter-spacing:.05em';
const SELECT_STYLE = 'padding:6px;background:#0d0d18;border:1px solid #555;color:#ddd;border-radius:3px;font-family:inherit;font-size:12px';

function makeRow(labelText) {
  const row = document.createElement('div');
  row.style.cssText = ROW_STYLE;
  const label = document.createElement('label');
  label.textContent = labelText;
  label.style.cssText = LABEL_STYLE;
  row.appendChild(label);
  return row;
}

function makeSelect(options, currentValue, onChange) {
  const sel = document.createElement('select');
  sel.style.cssText = SELECT_STYLE;
  for (const { label, value } of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = currentValue;
  // If currentValue doesn't match any option (e.g. a stored numeric
  // multiplier carried over from an older settings schema), snap the
  // dropdown to the closest numeric option so the UI doesn't show a
  // mismatched selection. Don't write back to settings here; the user's
  // first change will overwrite the stored value cleanly.
  if (sel.value === '' && typeof currentValue === 'number') {
    let closest = options[0];
    let minDelta = Math.abs(currentValue - Number(closest.value));
    for (const opt of options) {
      const delta = Math.abs(currentValue - Number(opt.value));
      if (delta < minDelta) { closest = opt; minDelta = delta; }
    }
    sel.value = closest.value;
  }
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function makeSlotHeader(parent, text) {
  const h = document.createElement('div');
  h.textContent = text;
  h.style.cssText = 'color:#aab;font-size:11px;font-weight:bold;letter-spacing:.08em;margin-top:6px;text-transform:uppercase';
  parent.appendChild(h);
}

// One labeled checkbox bound to a boolean SETTINGS key. onToggle(checked) runs
// after the new value is persisted (e.g. to reveal a sub-panel or repaint the
// board). Returns the <input> so callers can read/drive it.
function addDevtoolsToggle(parent, labelText, key, onToggle) {
  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:8px;color:#cce;font-size:12px;cursor:pointer;padding:2px 0';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!SETTINGS.get(key);
  label.appendChild(cb);
  label.appendChild(document.createTextNode(labelText));
  parent.appendChild(label);
  cb.onchange = () => { SETTINGS.set(key, cb.checked); if (onToggle) onToggle(cb.checked); };
  return cb;
}

// Devtools collapsible. Default-collapsed; if showFontDevtools is already
// true from a prior session, start expanded so the toggle is reachable.
// The font-picker UI lives in pickerArea (returned for the rest of render
// to append into) and is shown/hidden via display:none, NOT re-rendered.
function renderDevtoolsCollapsible(list) {
  const startExpanded = !!SETTINGS.get('showFontDevtools');

  const devtoolsHeader = document.createElement('button');
  devtoolsHeader.textContent = (startExpanded ? '▾' : '▸') + ' Devtools';
  devtoolsHeader.style.cssText = 'margin-top:10px;padding:6px 10px;background:#0d0d18;border:1px solid #444;color:#aab;border-radius:3px 3px 0 0;cursor:pointer;font-family:inherit;font-size:12px;width:100%;text-align:left;letter-spacing:.05em';
  list.appendChild(devtoolsHeader);

  const devtoolsBody = document.createElement('div');
  devtoolsBody.style.cssText = 'padding:8px 10px;background:#0d0d18;border:1px solid #333;border-top:none;border-radius:0 0 3px 3px;margin-bottom:6px';
  devtoolsBody.style.display = startExpanded ? '' : 'none';
  list.appendChild(devtoolsBody);

  devtoolsHeader.onclick = () => {
    const visible = devtoolsBody.style.display !== 'none';
    devtoolsBody.style.display = visible ? 'none' : '';
    devtoolsHeader.textContent = (visible ? '▸' : '▾') + ' Devtools';
  };

  const pickerArea = document.createElement('div');
  pickerArea.style.display = SETTINGS.get('showFontDevtools') ? '' : 'none';

  addDevtoolsToggle(devtoolsBody, 'Show font picker UI', 'showFontDevtools', (on) => {
    pickerArea.style.display = on ? '' : 'none';
  });
  // Reveal the AI's hand face-up (cardbacks → real cards) for judging AI play.
  // Repaint immediately so the change shows without waiting for the next tick;
  // render() reads ENGINE.state(), so guard for the not-in-game case.
  addDevtoolsToggle(devtoolsBody, "Reveal AI opponent's hand", 'revealAiHand', () => {
    if (typeof render === 'function') { try { render(); } catch (e) { /* not in a game */ } }
  });

  list.appendChild(pickerArea);
  return pickerArea;
}

// Master card-size dropdown. Scales the whole hand/board frame (art, text,
// pips) uniformly off the 1x baseline via the --card-size-scale CSS var —
// SETTINGS.set pushes the var live, so cards resize without a re-render;
// render() just refreshes any size-dependent layout. Sits at the top of the
// picker since the per-element font sizes below are all relative to 1x.
function renderCardSizeRow(pickerArea) {
  makeSlotHeader(pickerArea, 'Card size');
  const row = makeRow('Hand / board card scale');
  row.appendChild(makeSelect(
    SETTINGS.CARD_SIZE_OPTIONS,
    SETTINGS.get('cardSizeScale'),
    (val) => { SETTINGS.set('cardSizeScale', Number(val)); render(); }
  ));
  pickerArea.appendChild(row);
}

// Slot-shaped preset dropdown. Applying a preset writes the title font to
// all four title-slot elements, body font to body-slot, pip font to pip-
// slot. 'Custom' appears when per-element values don't all match a preset.
// Returns a refreshPresetActive() callback so renderFontElementRows can
// flip the dropdown to "Custom" the moment a per-element font change
// diverges from the active named preset.
function renderFontPresetRow(pickerArea) {
  const fontHeader = document.createElement('div');
  fontHeader.textContent = 'Card fonts';
  fontHeader.style.cssText = 'color:#ffd700;font-size:13px;font-weight:bold;letter-spacing:.06em;margin-top:6px;padding-top:8px;border-top:1px solid #333';
  pickerArea.appendChild(fontHeader);

  const scaleNote = document.createElement('div');
  scaleNote.textContent = 'Sizes shown at 1× card size (the Card size knob above scales these too).';
  scaleNote.style.cssText = 'color:#778;font-size:10px;font-style:italic;margin-top:-2px';
  pickerArea.appendChild(scaleNote);

  const presetEntries = Object.entries(SETTINGS.FONT_PRESETS);

  function slotFontsMatch(slot, fontValue) {
    return SETTINGS.CARD_FONT_ELEMENTS
      .filter(el => el.slot === slot)
      .every(el => SETTINGS.get(SETTINGS.settingsKeyFont(el.key)) === fontValue);
  }
  function activePresetName() {
    for (const [name, preset] of presetEntries) {
      if (slotFontsMatch('title', preset.title)
          && slotFontsMatch('body', preset.body)
          && slotFontsMatch('pip', preset.pip)) {
        return name;
      }
    }
    return '__custom__';
  }

  const presetRow = makeRow('Preset (applies to slot)');
  const presetOptions = presetEntries.map(([name]) => ({ label: name, value: name }));
  presetOptions.push({ label: 'Custom', value: '__custom__' });
  const presetSelect = makeSelect(presetOptions, activePresetName(), (val) => {
    if (val === '__custom__') return;
    const preset = SETTINGS.FONT_PRESETS[val];
    const slotToFont = { title: preset.title, body: preset.body, pip: preset.pip };
    for (const el of SETTINGS.CARD_FONT_ELEMENTS) {
      SETTINGS.set(SETTINGS.settingsKeyFont(el.key), slotToFont[el.slot]);
    }
    render();
    renderPanel();
  });
  presetRow.appendChild(presetSelect);
  pickerArea.appendChild(presetRow);

  // Returned to renderFontElementRows so each per-element font change
  // can flip the preset dropdown to 'Custom' the moment the user
  // diverges from a named preset.
  return function refreshPresetActive() {
    presetSelect.value = activePresetName();
  };
}

// Per-element rows: title (name/type/PT/damage), body (oracle/stickers),
// pip (mana number/cost arrow). Each row has a font dropdown and a size
// dropdown. On font change, refresh the preset dropdown so 'Custom'
// appears when the user diverges from a named preset.
function renderFontElementRows(pickerArea, refreshPresetActive) {
  function makeElementRow(element) {
    const row = makeRow(element.label);
    const fontKey = SETTINGS.settingsKeyFont(element.key);
    const sizeKey = SETTINGS.settingsKeyFsize(element.key);
    row.appendChild(makeSelect(
      SETTINGS.FONT_OPTIONS,
      SETTINGS.get(fontKey),
      (val) => {
        SETTINGS.set(fontKey, val);
        refreshPresetActive();
        render();
      }
    ));
    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px';
    const sizeLabel = document.createElement('span');
    sizeLabel.textContent = 'Size';
    sizeLabel.style.cssText = 'color:#889;font-size:11px;min-width:30px';
    sizeRow.appendChild(sizeLabel);
    const sizeSelect = makeSelect(
      SETTINGS.FONT_SIZE_OPTIONS_BY_ELEMENT[element.key],
      SETTINGS.get(sizeKey),
      (val) => {
        SETTINGS.set(sizeKey, Number(val));
        render();
      }
    );
    sizeSelect.style.flex = '1';
    sizeRow.appendChild(sizeSelect);
    row.appendChild(sizeRow);
    pickerArea.appendChild(row);
  }
  makeSlotHeader(pickerArea, 'Title elements');
  SETTINGS.CARD_FONT_ELEMENTS.filter(e => e.slot === 'title').forEach(makeElementRow);
  makeSlotHeader(pickerArea, 'Body elements');
  SETTINGS.CARD_FONT_ELEMENTS.filter(e => e.slot === 'body').forEach(makeElementRow);
  makeSlotHeader(pickerArea, 'Pip elements');
  SETTINGS.CARD_FONT_ELEMENTS.filter(e => e.slot === 'pip').forEach(makeElementRow);
}

// Popup text scale: applies on top of per-element sizes when a card is
// rendered in the long-press popup (.in-popup). 1 = text scales
// proportionally with the 4x frame; lower keeps text smaller so more
// oracle text fits.
function renderPopupTextScaleRow(pickerArea) {
  makeSlotHeader(pickerArea, 'Popup (long-press detail)');
  const popupRow = makeRow('Text scale relative to frame');
  popupRow.appendChild(makeSelect(
    SETTINGS.POPUP_TEXT_SCALE_OPTIONS,
    SETTINGS.get('cardPopupTextScale'),
    (val) => { SETTINGS.set('cardPopupTextScale', Number(val)); render(); }
  ));
  pickerArea.appendChild(popupRow);
}

// Mana symbol sizes: two pip surfaces (hand/board vs popup) and one text
// surface ({R}/{T} inside oracle text).
function renderManaPipSizeRows(pickerArea) {
  makeSlotHeader(pickerArea, 'Mana symbols');
  const manaPipRow = makeRow('Cost pip (hand / board)');
  manaPipRow.appendChild(makeSelect(
    SETTINGS.MANA_PIP_SIZE_OPTIONS,
    SETTINGS.get('cardManaPipSize'),
    (val) => { SETTINGS.set('cardManaPipSize', Number(val)); render(); }
  ));
  pickerArea.appendChild(manaPipRow);

  const manaPipPopupRow = makeRow('Cost pip (long-press popup)');
  manaPipPopupRow.appendChild(makeSelect(
    SETTINGS.MANA_PIP_SIZE_OPTIONS,
    SETTINGS.get('cardManaPipPopupSize'),
    (val) => { SETTINGS.set('cardManaPipPopupSize', Number(val)); render(); }
  ));
  pickerArea.appendChild(manaPipPopupRow);
}

function renderManaTextScaleRow(pickerArea) {
  const manaTextRow = makeRow('In-text symbol (oracle text {R}/{T})');
  manaTextRow.appendChild(makeSelect(
    SETTINGS.MANA_TEXT_SIZE_OPTIONS,
    SETTINGS.get('cardManaTextSize'),
    (val) => { SETTINGS.set('cardManaTextSize', Number(val)); render(); }
  ));
  pickerArea.appendChild(manaTextRow);
}

// Ability (keyword) icon size: the coins in the in-play frame's keyword row
// (flying, vigilance, innate, …). --card-kw-icon-size is pushed live by
// SETTINGS.set, so the coins resize immediately; render() just refreshes layout.
function renderKwIconSizeRow(pickerArea) {
  makeSlotHeader(pickerArea, 'Ability icons');
  const kwRow = makeRow('Keyword coin (hand / board)');
  kwRow.appendChild(makeSelect(
    SETTINGS.KW_ICON_SIZE_OPTIONS,
    SETTINGS.get('cardKwIconSize'),
    (val) => { SETTINGS.set('cardKwIconSize', Number(val)); render(); }
  ));
  pickerArea.appendChild(kwRow);
}

// Export-current-settings button. Dumps SETTINGS.getAll() to clipboard so
// a tuning session can be baked into DEFAULTS. Falls back to an inline
// textarea on browsers that refuse clipboard.writeText.
function renderExportButton(pickerArea) {
  const exportWrap = document.createElement('div');
  exportWrap.style.cssText = 'margin-top:14px;padding-top:10px;border-top:1px solid #333';
  const exportBtn = document.createElement('button');
  exportBtn.textContent = '📋 Copy settings as JSON';
  exportBtn.style.cssText = 'padding:8px 14px;background:#2a3a44;border:1px solid #4a6a8a;color:#cce;border-radius:4px;cursor:pointer;font-family:inherit;font-size:12px;width:100%';
  exportBtn.onclick = () => {
    const json = JSON.stringify(SETTINGS.getAll(), null, 2);
    const flash = (msg, ok) => {
      exportBtn.textContent = msg;
      exportBtn.style.background = ok ? '#1a4a2a' : '#4a2a2a';
      setTimeout(() => {
        exportBtn.textContent = '📋 Copy settings as JSON';
        exportBtn.style.background = '#2a3a44';
      }, 1800);
    };
    function showFallbackTextarea() {
      let ta = exportWrap.querySelector('textarea');
      if (!ta) {
        ta = document.createElement('textarea');
        ta.style.cssText = 'width:100%;height:160px;margin-top:6px;background:#0d0d18;color:#ddd;border:1px solid #444;border-radius:3px;font-family:monospace;font-size:10px;padding:4px;box-sizing:border-box';
        exportWrap.appendChild(ta);
      }
      ta.value = json;
      ta.select();
      flash('⚠ Clipboard blocked — select + copy', false);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(
        () => flash('✓ Copied to clipboard', true),
        () => showFallbackTextarea()
      );
    } else {
      showFallbackTextarea();
    }
  };
  exportWrap.appendChild(exportBtn);
  pickerArea.appendChild(exportWrap);
}

// Named `renderPanel` (not `render`) so the global `render` from render.js
// stays in scope inside this IIFE — the per-row onChange callbacks above
// call render() to re-paint the game view.
function renderPanel() {
  const list = document.getElementById('settingsList');
  if (!list) return;
  list.innerHTML = '';

  const pickerArea = renderDevtoolsCollapsible(list);
  renderCardSizeRow(pickerArea);
  const refreshPresetActive = renderFontPresetRow(pickerArea);
  renderFontElementRows(pickerArea, refreshPresetActive);
  renderPopupTextScaleRow(pickerArea);
  renderManaPipSizeRows(pickerArea);
  renderManaTextScaleRow(pickerArea);
  renderKwIconSizeRow(pickerArea);
  renderExportButton(pickerArea);
}

function show() {
  renderPanel();
  Modal.show('settingsModal');
}

return { render: renderPanel, show };
})();
