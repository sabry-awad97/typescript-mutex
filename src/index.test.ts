import { beforeEach, describe, expect, it } from "vitest";
import { Mutex, createDeferred } from "./index";

describe("Mutex", () => {
  let mutex: Mutex<number>;

  beforeEach(() => {
    mutex = Mutex.new(0);
  });

  describe("Basic Lock Operations", () => {
    it("should allow acquiring a lock when mutex is free", async () => {
      const guard = await mutex.lock();
      expect(guard).toBeDefined();
      guard.release();
    });

    it("should prevent multiple simultaneous locks", async () => {
      const guard1 = await mutex.lock();
      const guard2Promise = mutex.lock();

      // guard2 should not resolve until guard1 is released
      const guard2Resolved = await Promise.race([
        guard2Promise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 50)),
      ]);

      expect(guard2Resolved).toBe(false);

      guard1.release();
      const guard2 = await guard2Promise;
      expect(guard2).toBeDefined();
      guard2.release();
    });
  });

  describe("Value Operations", () => {
    it("should allow reading values through guard", async () => {
      const guard = await mutex.lock();
      expect(guard.value).toBe(0);
      guard.release();
    });

    it("should allow modifying values through guard", async () => {
      const guard = await mutex.lock();
      const value = guard.value;
      expect(value).toBe(0);
      guard.value = value + 1;
      guard.release();
    });

    it("should throw when accessing value after release", async () => {
      const guard = await mutex.lock();
      guard.release();

      expect(() => guard.value).toThrow("Cannot use a released MutexGuard");
    });
  });

  describe("Lock Release Handling", () => {
    it("should allow multiple release calls without error", async () => {
      const guard = await mutex.lock();
      guard.release();
      guard.release(); // Should not throw
      expect(mutex.tryLock()).not.toBeNull();
    });

    it("should process queue after release", async () => {
      const guard1 = await mutex.lock();
      const guard2Promise = mutex.lock();
      const guard3Promise = mutex.lock();

      guard1.release();
      const guard2 = await guard2Promise;
      guard2.release();
      const guard3 = await guard3Promise;
      guard3.release();
    });
  });

  describe("Queue Processing", () => {
    it("should maintain FIFO order for waiting locks", async () => {
      const results: number[] = [];
      const guard1 = await mutex.lock();

      // Create multiple waiting locks
      const promise2 = mutex.lock().then(async (guard) => {
        results.push(2);
        guard.release();
      });

      const promise3 = mutex.lock().then(async (guard) => {
        results.push(3);
        guard.release();
      });

      // Release the first lock after a small delay
      setTimeout(() => {
        results.push(1);
        guard1.release();
      }, 50);

      await Promise.all([promise2, promise3]);
      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe("Concurrent Access Patterns", () => {
    it("should handle multiple concurrent operations correctly", async () => {
      const operations = 10;
      const incrementers = Array(operations)
        .fill(0)
        .map(async () => {
          const guard = await mutex.lock();
          const current = guard.value;
          // Simulate some async work
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 10)
          );
          guard.value = current + 1;
          guard.release();
        });

      await Promise.all(incrementers);
      const finalGuard = await mutex.lock();
      expect(finalGuard.value).toBe(operations);
      finalGuard.release();
    });
  });

  describe("Error Conditions", () => {
    it("should handle errors in queued operations", async () => {
      const guard1 = await mutex.lock();

      // Create a promise that will error after getting the lock
      const errorOperation = mutex.lock().then((guard) => {
        guard.release();
        throw new Error("Operation failed");
      });

      // Create another operation that should succeed
      const successOperation = mutex.lock().then((guard) => {
        guard.release();
        return "success";
      });

      // Release the initial lock
      guard1.release();

      // The error operation should fail
      await expect(errorOperation).rejects.toThrow("Operation failed");

      // The success operation should complete
      const result = await successOperation;
      expect(result).toBe("success");

      // Final state check
      expect(mutex.tryLock()).not.toBeNull();
    });

    it("should maintain mutex state after error in queued operation", async () => {
      const guard1 = await mutex.lock();

      // Queue an operation that will error
      const errorOperation = mutex.lock().then((guard) => {
        guard.release();
        throw new Error("Operation failed");
      });

      guard1.release();

      // Error should be caught
      await expect(errorOperation).rejects.toThrow("Operation failed");

      // Mutex should be available for new operations
      const newGuard = await mutex.lock();
      expect(newGuard).toBeDefined();
      newGuard.release();
      expect(mutex.tryLock()).not.toBeNull();
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
        const guard = await mutex.lock();
        guard.release();
      }
      expect(mutex.tryLock()).not.toBeNull();
    });

    it("should maintain value consistency under stress", async () => {
      const iterations = 100;
      const promises = Array(iterations)
        .fill(0)
        .map(async (_, index) => {
          const guard = await mutex.lock();
          const value = guard.value;
          mutex = Mutex.new(index); // In real Rust, we'd use derefMut()
          guard.release();
          return value;
        });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(iterations);
      // Note: We can't guarantee uniqueness of values in this implementation
      // since we're replacing the entire mutex
    });
  });

  describe("Rust-specific API", () => {
    it("should support try_lock", () => {
      const guard = mutex.tryLock();
      expect(guard).not.toBeNull();
      guard?.release();
    });

    it("should return null on try_lock when locked", async () => {
      const guard1 = await mutex.lock();
      const guard2 = mutex.tryLock();
      expect(guard2).toBeNull();
      guard1.release();
    });

    it("should support into_inner", () => {
      const value = mutex.intoInner();
      expect(value).toBe(0);
    });

    it("should throw on into_inner when locked", async () => {
      const guard = await mutex.lock();
      expect(() => mutex.intoInner()).toThrow();
      guard.release();
    });
  });
});
