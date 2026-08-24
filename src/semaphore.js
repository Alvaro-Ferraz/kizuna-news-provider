'use strict';

class Semaphore {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Semaphore limit must be positive');
    this.limit = limit;
    this.active = 0;
    this.queue = [];
  }

  acquire(timeoutMs) {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve(this.createRelease());
    }

    return new Promise((resolve, reject) => {
      const entry = { resolve, timer: null };
      if (Number.isFinite(timeoutMs)) {
        entry.timer = setTimeout(() => {
          const index = this.queue.indexOf(entry);
          if (index !== -1) this.queue.splice(index, 1);
          reject(new Error('SEMAPHORE_TIMEOUT'));
        }, Math.max(0, timeoutMs));
      }
      this.queue.push(entry);
    });
  }

  tryAcquire() {
    if (this.active >= this.limit) return null;
    this.active += 1;
    return this.createRelease();
  }

  createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) {
        if (next.timer) clearTimeout(next.timer);
        next.resolve(this.createRelease());
      }
      else this.active -= 1;
    };
  }
}

module.exports = { Semaphore };
