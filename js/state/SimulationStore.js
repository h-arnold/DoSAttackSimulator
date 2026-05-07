import defaultSimulationState from './defaultSimulationState.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function clonePlainData(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlainData);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, clonePlainData(nestedValue)]));
  }

  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) {
    return value;
  }

  throw new TypeError('SimulationStore only supports plain object and array state.');
}

function cloneRootState(value, methodName) {
  if (!isPlainObject(value)) {
    throw new TypeError(`SimulationStore.${methodName} expects a plain object state tree.`);
  }

  return clonePlainData(value);
}

function mergePlainObjectPatch(targetState, patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (isPlainObject(value)) {
      const existingBranch = isPlainObject(targetState[key]) ? targetState[key] : {};
      targetState[key] = mergePlainObjectPatch(existingBranch, value);
      return;
    }

    targetState[key] = clonePlainData(value);
  });

  return targetState;
}

export default class SimulationStore {
  constructor(initialState = defaultSimulationState()) {
    this.state = cloneRootState(initialState, 'constructor');
  }

  getState() {
    return clonePlainData(this.state);
  }

  replaceState(nextState) {
    this.state = cloneRootState(nextState, 'replaceState');
  }

  updateState(patch) {
    if (!isPlainObject(patch)) {
      throw new TypeError('SimulationStore.updateState expects a plain object patch.');
    }

    this.state = mergePlainObjectPatch(clonePlainData(this.state), patch);
  }
}