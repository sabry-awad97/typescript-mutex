import { beforeEach, describe, expect, it } from "vitest";
import { Mutex, createDeferred } from "./index";

describe("Mutex", () => {
  let mutex: Mutex<number>;

  beforeEach(() => {
    mutex = new Mutex(0);
  });

  describe("Basic Lock Operations", () => {
    it("should allow acquiring a lock when mutex is free", async () => {
      const lock = await mutex.acquire();
      expect(mutex.isAcquired()).toBe(true);
      lock.release();
    });

    it("should prevent multiple simultaneous locks", async () => {
      const lock1 = await mutex.acquire();
      const lock2Promise = mutex.acquire();

      expect(mutex.isAcquired()).toBe(true);

      // lock2 should not resolve until lock1 is released
      const lock2Resolved = await Promise.race([
        lock2Promise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 50)),
      ]);

      expect(lock2Resolved).toBe(false);

      lock1.release();
      const lock2 = await lock2Promise;
      expect(mutex.isAcquired()).toBe(true);
      lock2.release();
    });
  });

  describe("Value Operations", () => {
    it("should allow reading and writing values through lock", async () => {
      const lock = await mutex.acquire();
      expect(lock.value()).toBe(0);

      lock.setValue(42);
      expect(lock.value()).toBe(42);

      lock.release();
    });

    it("should return previous value when setting new value", async () => {
      const lock = await mutex.acquire();
      lock.setValue(10);
      const oldValue = lock.setValue(20);
      expect(oldValue).toBe(10);
      lock.release();
    });

    it("should throw when accessing value after release", async () => {
      const lock = await mutex.acquire();
      lock.release();

      expect(() => lock.value()).toThrow("Can't read value from released Lock");
      expect(() => lock.setValue(42)).toThrow(
        "Can't write value to released Lock"
      );
    });
  });

  describe("Lock Release Handling", () => {
    it("should allow multiple release calls without error", async () => {
      const lock = await mutex.acquire();
      lock.release();
      lock.release(); // Should not throw
      expect(mutex.isAcquired()).toBe(false);
    });

    it("should process queue after release", async () => {
      const lock1 = await mutex.acquire();
      const lock2Promise = mutex.acquire();
      const lock3Promise = mutex.acquire();

      lock1.release();
      const lock2 = await lock2Promise;
      lock2.release();
      const lock3 = await lock3Promise;
      lock3.release();
    });
  });

  describe("Queue Processing", () => {
    it("should maintain FIFO order for waiting locks", async () => {
      const results: number[] = [];
      const lock1 = await mutex.acquire();

      // Create multiple waiting locks
      const promise2 = mutex.acquire().then(async (lock) => {
        results.push(2);
        lock.release();
      });

      const promise3 = mutex.acquire().then(async (lock) => {
        results.push(3);
        lock.release();
      });

      // Release the first lock after a small delay
      setTimeout(() => {
        results.push(1);
        lock1.release();
      }, 50);

      await Promise.all([promise2, promise3]);
      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe("Concurrent Access Patterns", () => {
    it("should handle multiple concurrent operations correctly", async () => {
      const finalValue = 100;
      const operations = 10;
      const incrementers = Array(operations)
        .fill(0)
        .map(async () => {
          const lock = await mutex.acquire();
          const current = lock.value();
          // Simulate some async work
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 10)
          );
          lock.setValue(current + 1);
          lock.release();
        });

      await Promise.all(incrementers);
      const lock = await mutex.acquire();
      expect(lock.value()).toBe(operations);
      lock.release();
    });
  });

  describe("Error Conditions", () => {
    it("should handle errors in queued operations", async () => {
      const lock1 = await mutex.acquire();

      // Create a promise that will error after getting the lock
      const errorOperation = mutex.acquire().then((lock) => {
        lock.release();
        throw new Error("Operation failed");
      });

      // Create another operation that should succeed
      const successOperation = mutex.acquire().then((lock) => {
        lock.release();
        return "success";
      });

      // Release the initial lock
      lock1.release();

      // The error operation should fail
      await expect(errorOperation).rejects.toThrow("Operation failed");

      // The success operation should complete
      const result = await successOperation;
      expect(result).toBe("success");

      // Final state check
      expect(mutex.isAcquired()).toBe(false);
    });

    it("should maintain mutex state after error in queued operation", async () => {
      const lock1 = await mutex.acquire();

      // Queue an operation that will error
      const errorOperation = mutex.acquire().then((lock) => {
        lock.release();
        throw new Error("Operation failed");
      });

      lock1.release();

      // Error should be caught
      await expect(errorOperation).rejects.toThrow("Operation failed");

      // Mutex should be available for new operations
      const newLock = await mutex.acquire();
      expect(mutex.isAcquired()).toBe(true);
      newLock.release();
      expect(mutex.isAcquired()).toBe(false);
    });
  });

  describe("Deferred Promise Functionality", () => {
    it("should properly resolve deferred promises", async () => {
      const deferred = createDeferred<string>();

      setTimeout(() => {
        deferred.resolve("test");
      }, 50);

      const result = await deferred.promise;
      expect(result).toBe("test");
    });

    it("should properly reject deferred promises", async () => {
      const deferred = createDeferred<string>();

      setTimeout(() => {
        deferred.reject(new Error("test error"));
      }, 50);

      await expect(deferred.promise).rejects.toThrow("test error");
    });
  });

  describe("Edge Cases", () => {
    it("should handle rapid acquire/release cycles", async () => {
      for (let i = 0; i < 100; i++) {
        const lock = await mutex.acquire();
        lock.release();
      }
      expect(mutex.isAcquired()).toBe(false);
    });

    it("should maintain value consistency under stress", async () => {
      const iterations = 100;
      const promises = Array(iterations)
        .fill(0)
        .map(async (_, index) => {
          const lock = await mutex.acquire();
          lock.setValue(index);
          const value = lock.value();
          lock.release();
          return value;
        });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(iterations);
      expect(new Set(results).size).toBe(iterations);
    });
  });
});
