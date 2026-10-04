// In-memory AsyncStorage for tests.
export const store = new Map<string, string>();
const AsyncStorage = {
  getItem: async (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: async (k: string, v: string) => void store.set(k, v),
  removeItem: async (k: string) => void store.delete(k),
  getAllKeys: async () => [...store.keys()],
  clear: async () => store.clear(),
};
export default AsyncStorage;
