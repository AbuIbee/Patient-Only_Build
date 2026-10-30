// Browser privacy policy can deny even reading window.sessionStorage.
// Fall back to this client instance's memory, never localStorage/cookies.
export function createTabSessionStorage() {
  const memory = new Map<string, string>();
  let available = true;
  return {
    getItem(key: string): string | null {
      if (available) {
        try {
          const value = window.sessionStorage.getItem(key);
          if (value === null) memory.delete(key);
          else memory.set(key, value);
          return value;
        } catch { available = false; }
      }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
      if (available) {
        try { window.sessionStorage.setItem(key, value); }
        catch { available = false; }
      }
    },
    removeItem(key: string): void {
      memory.delete(key);
      if (available) {
        try { window.sessionStorage.removeItem(key); }
        catch { available = false; }
      }
    },
  };
}
