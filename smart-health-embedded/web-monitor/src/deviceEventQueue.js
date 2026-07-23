function createKeyedSerialExecutor() {
  const tails = new Map();

  function enqueue(keyInput, task) {
    const key = String(keyInput || "").trim();
    if (!key) throw new TypeError("A non-empty serial execution key is required");
    if (typeof task !== "function") throw new TypeError("A serial task function is required");

    const previous = tails.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    tails.set(key, current);

    const clearCurrentTail = () => {
      if (tails.get(key) === current) tails.delete(key);
    };
    void current.then(clearCurrentTail, clearCurrentTail);
    return current;
  }

  return { enqueue };
}

module.exports = { createKeyedSerialExecutor };
