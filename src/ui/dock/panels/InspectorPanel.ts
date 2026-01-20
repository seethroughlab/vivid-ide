// =============================================================================
// Inspector Panel for dock-spawn-ts
// =============================================================================

import { store, subscribeToKey } from "../../../state/store";
import * as vivid from "../../../api/vivid";
import type { ParamInfo, OperatorInfo } from "../../../types";
import {
  isParamFloat,
  isParamInt,
  isParamBool,
  isParamColor,
  isParamEnum,
  getVecComponents,
} from "../../../types";

// Debounce timer for parameter updates
let paramDebounceTimer: number | null = null;
const PARAM_DEBOUNCE_MS = 50;

// Keep track of unsubscribers
const unsubscribers: (() => void)[] = [];

/**
 * Create the inspector panel element
 */
export function createInspectorPanel(): HTMLElement {
  const element = document.createElement("div");
  element.className = "inspector-panel-content";
  element.innerHTML = `
    <div class="inspector-section">
      <div class="section-title">Operators</div>
      <div id="operator-list" class="operator-list"></div>
    </div>
    <div class="inspector-section">
      <div class="section-title">Parameters</div>
      <div id="param-controls" class="param-controls">
        <div class="no-params">Select an operator</div>
      </div>
    </div>
  `;

  const operatorListEl = element.querySelector("#operator-list") as HTMLElement;
  const paramControlsEl = element.querySelector("#param-controls") as HTMLElement;

  // Subscribe to operators changes
  unsubscribers.push(
    subscribeToKey("operators", (state) => {
      updateOperatorList(operatorListEl, state.operators);
    })
  );

  // Subscribe to selected operator changes
  unsubscribers.push(
    subscribeToKey("selectedOperator", (state) => {
      updateOperatorList(operatorListEl, state.operators);
    })
  );

  // Subscribe to selected operator params changes
  unsubscribers.push(
    subscribeToKey("selectedOperatorParams", (state) => {
      updateParamControls(paramControlsEl, state.selectedOperator, state.selectedOperatorParams);
    })
  );

  // Initial render
  const state = store.get();
  updateOperatorList(operatorListEl, state.operators);
  updateParamControls(paramControlsEl, state.selectedOperator, state.selectedOperatorParams);

  console.log("[InspectorPanel] Initialized");

  return element;
}

function updateOperatorList(operatorListEl: HTMLElement, operators: OperatorInfo[]): void {
  const selectedOperator = store.get().selectedOperator;
  operatorListEl.innerHTML = "";

  for (const op of operators) {
    const item = document.createElement("div");
    item.className = "operator-item" + (op.name === selectedOperator ? " selected" : "");
    item.innerHTML = `
      <span class="op-name">${op.name}</span>
      <span class="op-type">${op.type_name}</span>
    `;
    item.addEventListener("click", () => selectOperator(op.name));
    operatorListEl.appendChild(item);
  }
}

async function selectOperator(name: string): Promise<void> {
  await store.selectOperator(name);
}

function updateParamControls(paramControlsEl: HTMLElement, opName: string | null, params: ParamInfo[]): void {
  paramControlsEl.innerHTML = "";

  if (!opName || params.length === 0) {
    paramControlsEl.innerHTML = '<div class="no-params">Select an operator</div>';
    return;
  }

  for (const param of params) {
    const control = createParamControl(opName, param);
    paramControlsEl.appendChild(control);
  }
}

function createParamControl(opName: string, param: ParamInfo): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "param-control";

  const label = document.createElement("label");
  label.textContent = param.name;
  wrapper.appendChild(label);

  if (isParamFloat(param) || isParamInt(param)) {
    createSliderControl(wrapper, opName, param);
  } else if (isParamBool(param)) {
    createCheckboxControl(wrapper, opName, param);
  } else if (isParamColor(param)) {
    createColorControl(wrapper, opName, param);
  } else if (isParamEnum(param)) {
    createEnumControl(wrapper, opName, param);
  } else {
    // Vec2, Vec3, Vec4
    createVecControl(wrapper, opName, param);
  }

  return wrapper;
}

function createSliderControl(wrapper: HTMLElement, opName: string, param: ParamInfo): void {
  const isInt = isParamInt(param);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(param.min_val);
  slider.max = String(param.max_val);
  slider.step = isInt ? "1" : "0.01";
  slider.value = String(param.value[0]);

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "param-value";
  valueDisplay.textContent = isInt
    ? String(Math.round(param.value[0]))
    : param.value[0].toFixed(2);

  slider.addEventListener("input", () => {
    const value = parseFloat(slider.value);
    valueDisplay.textContent = isInt ? String(Math.round(value)) : value.toFixed(2);
    debouncedSetParam(opName, param.name, value);
  });

  wrapper.appendChild(slider);
  wrapper.appendChild(valueDisplay);
}

function createCheckboxControl(wrapper: HTMLElement, opName: string, param: ParamInfo): void {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = param.value[0] > 0.5;

  checkbox.addEventListener("change", async () => {
    await vivid.setParamFloat(opName, param.name, checkbox.checked ? 1.0 : 0.0);
  });

  wrapper.appendChild(checkbox);
}

function createColorControl(wrapper: HTMLElement, opName: string, param: ParamInfo): void {
  const colorInput = document.createElement("input");
  colorInput.type = "color";

  // Convert float [0-1] to hex
  const r = Math.round(param.value[0] * 255);
  const g = Math.round(param.value[1] * 255);
  const b = Math.round(param.value[2] * 255);
  colorInput.value = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

  colorInput.addEventListener("input", async () => {
    const hex = colorInput.value;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    await vivid.setParamColor(opName, param.name, r, g, b, param.value[3]);
  });

  wrapper.appendChild(colorInput);
}

function createEnumControl(wrapper: HTMLElement, opName: string, param: ParamInfo): void {
  const select = document.createElement("select");

  param.enum_labels.forEach((labelText, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = labelText;
    if (Math.round(param.value[0]) === i) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener("change", async () => {
    await vivid.setParamFloat(opName, param.name, parseInt(select.value));
  });

  wrapper.appendChild(select);
}

function createVecControl(wrapper: HTMLElement, opName: string, param: ParamInfo): void {
  const components = getVecComponents(param);
  const componentLabels = ["x", "y", "z", "w"];

  for (let i = 0; i < components; i++) {
    const row = document.createElement("div");
    row.className = "vec-component";

    const compLabel = document.createElement("span");
    compLabel.textContent = componentLabels[i];
    row.appendChild(compLabel);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(param.min_val);
    slider.max = String(param.max_val);
    slider.step = "0.01";
    slider.value = String(param.value[i]);

    const valueDisplay = document.createElement("span");
    valueDisplay.className = "param-value";
    valueDisplay.textContent = param.value[i].toFixed(2);

    const componentIndex = i;
    slider.addEventListener("input", async () => {
      const newValue: [number, number, number, number] = [...param.value] as [number, number, number, number];
      newValue[componentIndex] = parseFloat(slider.value);
      valueDisplay.textContent = newValue[componentIndex].toFixed(2);
      await vivid.setParam(opName, param.name, newValue);
    });

    row.appendChild(slider);
    row.appendChild(valueDisplay);
    wrapper.appendChild(row);
  }
}

function debouncedSetParam(opName: string, paramName: string, value: number): void {
  if (paramDebounceTimer !== null) {
    clearTimeout(paramDebounceTimer);
  }

  paramDebounceTimer = window.setTimeout(async () => {
    paramDebounceTimer = null;
    await vivid.setParamFloat(opName, paramName, value);
  }, PARAM_DEBOUNCE_MS);
}
