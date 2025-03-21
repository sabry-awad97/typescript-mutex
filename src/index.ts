export type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

export function createDeferred<T>() {
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

export interface Lock<T> {
  value(): T;
  setValue(newValue: T): T;
  release(): void;
}

const GetValueSymbol = Symbol("GetValue");
const SetValueSymbol = Symbol("SetValue");
const UnlockSymbol = Symbol("Unlock");

class LockImpl<T> implements Lock<T> {
  private isReleased = false;

  public constructor(private mutex: Mutex<T>) {}

  public value(): T {
    if (this.isReleased) {
      throw new Error(`Can't read value from released Lock`);
    }
    return this.mutex[GetValueSymbol]();
  }
  public setValue(newValue: T): T {
    if (this.isReleased) {
      throw new Error(`Can't write value to released Lock`);
    }

    return this.mutex[SetValueSymbol](newValue);
  }
  public release(): void {
    if (this.isReleased) {
      return;
    }
    this.isReleased = true;
    this.mutex[UnlockSymbol](this);
  }
}

export class Mutex<T> {
  private currentLock: Lock<T> | undefined;
  private queue: Deferred<Lock<T>>[] = [];
  private value: T;

  constructor(value: T) {
    this.value = value;
  }

  private [GetValueSymbol](): T {
    return this.value;
  }

  private [SetValueSymbol](newValue: T): T {
    const oldValue = this.value;
    this.value = newValue;
    return oldValue;
  }

  private lock(): Lock<T> {
    this.currentLock = new LockImpl<T>(this);
    return this.currentLock;
  }

  private [UnlockSymbol](lock: Lock<T>): void {
    if (this.currentLock !== lock) {
      throw Error(
        "The lock given to free, is not currently assigned to this mutex!. Something really strange happend!"
      );
    }

    this.currentLock = undefined;
    this.processQueue();
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      return;
    }

    if (this.currentLock === undefined) {
      const lock = this.lock();
      const q = this.queue.shift();
      if (q) {
        q.resolve(lock);
      }
    }
  }

  public isAcquired(): boolean {
    return this.currentLock !== undefined;
  }

  public async acquire(): Promise<Lock<T>> {
    const deferred = createDeferred<Lock<T>>();
    this.queue.push(deferred);
    this.processQueue();
    return deferred.promise;
  }
}
