import '@testing-library/jest-dom';

// Provide a complete in-memory localStorage implementation.
// vitest's jsdom environment may omit .clear() when --localstorage-file is active,
// which breaks tests that reset state in beforeEach/afterEach.
const makeStorage = () => {
  let store = {};
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (n) => Object.keys(store)[n] ?? null,
  };
};

Object.defineProperty(window, 'localStorage', {
  value: makeStorage(),
  writable: true,
  configurable: true,
});
Object.defineProperty(window, 'sessionStorage', {
  value: makeStorage(),
  writable: true,
  configurable: true,
});
