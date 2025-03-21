interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export function createDeferred<T>(): Deferred<T> {
  const deferred: Partial<Deferred<T>> = {
    promise: undefined,
    resolve: undefined,
    reject: undefined,
  };

  const promise = new Promise<T>((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  deferred.promise = promise;

  return deferred as Deferred<T>;
}

const unlockSymbol = Symbol("unlockInternal");
const valueSymbol = Symbol("valueInternal");

// Similar to Rust's MutexGuard
class MutexGuard<T> {
  #isReleased = false;
  #value: T;

  constructor(private mutex: Mutex<T>, value: T) {
    this.#value = value;
  }

  public get value(): T {
    if (this.#isReleased) {
      throw new Error("Cannot use a released MutexGuard");
    }
    return this.#value;
  }

  public set value(newValue: T) {
    if (this.#isReleased) {
      throw new Error("Cannot use a released MutexGuard");
    }
    this.#value = newValue;
    this.mutex[valueSymbol] = newValue;
  }

  public release(): void {
    if (this.#isReleased) {
      return;
    }
    this.#isReleased = true;
    this.mutex[unlockSymbol](this);
  }
}

// Similar to Rust's Mutex
export class Mutex<T> {
  #currentGuard: MutexGuard<T> | undefined;
  #queue: Deferred<MutexGuard<T>>[] = [];
  private [valueSymbol]: T;

  private constructor(value: T) {
    this[valueSymbol] = value;
  }

  public static new<T>(value: T): Mutex<T> {
    return new Mutex(value);
  }

  public async lock(): Promise<MutexGuard<T>> {
    const deferred = createDeferred<MutexGuard<T>>();
    this.#queue.push(deferred);
    this.processQueue();
    return deferred.promise;
  }

  public tryLock(): MutexGuard<T> | null {
    if (this.#currentGuard !== undefined) {
      return null;
    }
    return this.createGuard();
  }

  public intoInner(): T {
    if (this.#currentGuard !== undefined) {
      throw new Error("Cannot consume mutex while it is locked");
    }
    return this[valueSymbol];
  }

  private createGuard(): MutexGuard<T> {
    const guard = new MutexGuard(this, this[valueSymbol]);
    this.#currentGuard = guard;
    return guard;
  }

  private processQueue(): void {
    if (this.#queue.length === 0) {
      return;
    }

    if (this.#currentGuard === undefined) {
      const guard = this.createGuard();
      const deferred = this.#queue.shift();
      if (deferred) {
        deferred.resolve(guard);
      }
    }
  }

  private [unlockSymbol](guard: MutexGuard<T>): void {
    if (this.#currentGuard !== guard) {
      throw new Error("Invalid guard provided for unlock operation");
    }

    this.#currentGuard = undefined;
    this.processQueue();
  }
}

// MutexCollection for managing multiple mutexes
export class MutexCollection<K, V> {
  #mutexes = new Map<K, Mutex<V>>();

  constructor(private readonly defaultValueFactory: (key: K) => V) {}

  public async lock(key: K): Promise<MutexGuard<V>> {
    const mutex = this.getOrCreateMutex(key);
    return mutex.lock();
  }

  public tryLock(key: K): MutexGuard<V> | null {
    const mutex = this.getOrCreateMutex(key);
    return mutex.tryLock();
  }

  public has(key: K): boolean {
    return this.#mutexes.has(key);
  }

  public remove(key: K): boolean {
    const mutex = this.#mutexes.get(key);
    if (!mutex) return false;

    try {
      mutex.intoInner(); // Will throw if mutex is locked
      this.#mutexes.delete(key);
      return true;
    } catch {
      return false;
    }
  }

  public clear(): void {
    const lockedKeys: K[] = [];
    
    this.#mutexes.forEach((mutex, key) => {
      try {
        mutex.intoInner(); // Will throw if mutex is locked
      } catch {
        lockedKeys.push(key);
      }
    });

    if (lockedKeys.length > 0) {
      throw new Error(
        `Cannot clear collection: mutexes are locked for keys: ${lockedKeys.join(", ")}`
      );
    }

    this.#mutexes.clear();
  }

  public async withLock<R>(key: K, fn: (value: V) => Promise<R>): Promise<R> {
    const guard = await this.lock(key);
    try {
      return await fn(guard.value);
    } finally {
      guard.release();
    }
  }

  public size(): number {
    return this.#mutexes.size;
  }

  private getOrCreateMutex(key: K): Mutex<V> {
    let mutex = this.#mutexes.get(key);
    if (!mutex) {
      mutex = Mutex.new(this.defaultValueFactory(key));
      this.#mutexes.set(key, mutex);
    }
    return mutex;
  }
}
