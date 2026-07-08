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

const storageLocal: StorageLikeAsync = {
  removeItem(key: string) {
    try { localStorage.removeItem(key) } catch {}
    return storage.local.remove(key)
  },

  setItem(key: string, value: string) {
    // Sync to localStorage so content script can read theme synchronously
    try { localStorage.setItem(key, value) } catch {}
    return storage.local.set({ [key]: value })
  },

  async getItem(key: string) {
    // Try localStorage first for instant availability on next page load
    try {
      const cached = localStorage.getItem(key)
      if (cached !== null) return cached
    } catch {}
    return (await storage.local.get(key))[key]
  },
}

export function useStorageLocal<T>(key: string, initialValue: MaybeRef<T>, options?: UseStorageAsyncOptions<T>): RemovableRef<T> {
  return useStorageAsync(key, initialValue, storageLocal, options)
}
