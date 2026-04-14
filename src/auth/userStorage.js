const PREFIXES = ['mt_', 'autobot_'];

export function installUserStorageShim() {
  const original = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem,
  };

  function getUserPrefix() {
    try {
      const raw = original.getItem.call(localStorage, 'funnel_autobot_auth_user');
      if (!raw) return null;
      const user = JSON.parse(raw);
      return user?.email ? `__${user.email}__` : null;
    } catch {
      return null;
    }
  }

  function needsPrefix(key) {
    return PREFIXES.some((p) => key.startsWith(p));
  }

  Storage.prototype.getItem = function (key) {
    if (needsPrefix(key)) {
      const prefix = getUserPrefix();
      if (prefix) {
        const val = original.getItem.call(this, prefix + key);
        if (val !== null) return val;
      }
    }
    return original.getItem.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (needsPrefix(key)) {
      const prefix = getUserPrefix();
      if (prefix) {
        return original.setItem.call(this, prefix + key, value);
      }
    }
    return original.setItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key) {
    if (needsPrefix(key)) {
      const prefix = getUserPrefix();
      if (prefix) {
        return original.removeItem.call(this, prefix + key);
      }
    }
    return original.removeItem.call(this, key);
  };
}
