import type {
  MaybeRef,
  RemovableRef,
  StorageLikeAsync,
  UseStorageAsyncOptions,
} from '@vueuse/core'
import {
  useStorageAsync,
} from '@vueuse/core'
import { storage } from 'webextension-polyfill'

// Track the last value we wrote so we can ignore re-reads of our own writes
const writeCache = new Map<string, string>()

const storageLocal: StorageLikeAsync = {
  removeItem(key: string) {
    try { localStorage.removeItem(key) } catch {}
    writeCache.delete(key)
    return storage.local.remove(key)
  },

  setItem(key: string, value: string) {
    writeCache.set(key, value)
    try { localStorage.setItem(key, value) } catch {}
    return storage.local.set({ [key]: value })
  },

  async getItem(key: string) {
    // If we just wrote this exact value, return it directly (avoid re-parse loop)
    const cached = writeCache.get(key)
    if (cached !== undefined) {
      writeCache.delete(key)
      return cached
    }
    try {
      const local = localStorage.getItem(key)
      if (local !== null) return local
    } catch {}
    return (await storage.local.get(key))[key]
  },
}

export function useStorageLocal<T>(key: string, initialValue: MaybeRef<T>, options?: UseStorageAsyncOptions<T>): RemovableRef<T> {
  return useStorageAsync(key, initialValue, storageLocal, options)
}
