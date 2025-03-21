

# 🔒 TypeScript Mutex Implementation

A robust and type-safe implementation of the Mutex pattern in TypeScript, inspired by Rust's synchronization primitives. This implementation provides a clean and efficient way to handle mutual exclusion in asynchronous TypeScript applications.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Test Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![License](https://img.shields.io/badge/license-ISC-blue)

## ✨ Features

- **Type-Safe**: Fully typed implementation with TypeScript generics
- **Rust-Inspired**: Based on Rust's battle-tested Mutex pattern
- **RAII-Style Guards**: Automatic resource management through MutexGuard
- **Async/Await Support**: First-class support for asynchronous operations
- **Zero Dependencies**: Pure TypeScript implementation
- **Deadlock Prevention**: Built-in queue management system
- **Collection Support**: MutexCollection for managing multiple mutexes
- **Resource Pooling**: Efficient handling of multiple resources with key-based locking

## 🚀 Quick Start

### Basic Mutex Usage

```typescript
import { Mutex } from './mutex';

// Create a new mutex with initial value
const mutex = Mutex.new(0);

async function increment() {
  // Acquire the lock
  const guard = await mutex.lock();
  
  try {
    // Modify the protected value
    guard.value += 1;
  } finally {
    // Release the lock
    guard.release();
  }
}
```

### MutexCollection Usage

```typescript
import { MutexCollection } from './mutex';

// Create a collection of mutexes with a default value factory
const collection = new MutexCollection<string, number>(() => 0);

// Using withLock for automatic lock management
await collection.withLock("counter1", async (value) => {
  return value + 1;
});

// Manual lock management
const guard = await collection.lock("counter2");
try {
  guard.value += 1;
} finally {
  guard.release();
}
```

## 📚 API Reference

### `Mutex<T>`

#### Creation
```typescript
const mutex = Mutex.new<T>(initialValue: T)
```

#### Methods

- **`lock(): Promise<MutexGuard<T>>`**
  - Acquires the mutex asynchronously
  - Returns a promise that resolves to a MutexGuard

- **`tryLock(): MutexGuard<T> | null`**
  - Attempts to acquire the mutex immediately
  - Returns null if the mutex is already locked

- **`intoInner(): T`**
  - Consumes the mutex and returns the inner value
  - Throws if the mutex is currently locked

### `MutexGuard<T>`

#### Properties

- **`value: T`**
  - Getter/Setter for the protected value
  - Throws if the guard has been released

#### Methods

- **`release(): void`**
  - Releases the mutex lock
  - Safe to call multiple times

### `MutexCollection<K, V>`

#### Creation
```typescript
const collection = new MutexCollection<K, V>((key: K) => V)
```

#### Methods

- **`lock(key: K): Promise<MutexGuard<V>>`**
  - Acquires a mutex for the specified key
  - Creates a new mutex if one doesn't exist

- **`tryLock(key: K): MutexGuard<V> | null`**
  - Attempts to acquire the mutex for the specified key
  - Returns null if the mutex is locked

- **`withLock<R>(key: K, fn: (value: V) => Promise<R>): Promise<R>`**
  - Executes a function with automatic lock management
  - Ensures the lock is released after execution

- **`has(key: K): boolean`**
  - Checks if a mutex exists for the specified key

- **`remove(key: K): boolean`**
  - Removes an unlocked mutex from the collection
  - Returns false if the mutex is locked

- **`size(): number`**
  - Returns the number of mutexes in the collection

## 🔍 Examples

### Basic Usage

```typescript
const mutex = Mutex.new<number[]>([]);

async function addItem(item: number) {
  const guard = await mutex.lock();
  try {
    guard.value.push(item);
  } finally {
    guard.release();
  }
}
```

### Collection Usage

```typescript
const userScores = new MutexCollection<string, number>(() => 0);

async function updateScore(userId: string, points: number) {
  await userScores.withLock(userId, async (score) => {
    return score + points;
  });
}
```

### Non-blocking Try Lock

```typescript
const mutex = Mutex.new<Map<string, number>>(new Map());

function tryUpdate(key: string, value: number): boolean {
  const guard = mutex.tryLock();
  if (!guard) return false;
  
  try {
    guard.value.set(key, value);
    return true;
  } finally {
    guard.release();
  }
}
```

## 🧪 Testing

The implementation includes a comprehensive test suite. Run the tests using:

```bash
npm test
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Rust's [std::sync::Mutex](https://doc.rust-lang.org/std/sync/struct.Mutex.html)
- Built with TypeScript's type system
- Tested with Vitest

---

<p align="center">Made with ❤️ by <a href="https://github.com/sabry-awad97">Sabry Awad</a></p>
