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

// Track the last value we wrote so we can return it directly on re-read.
const writeCache = new Map<string, { value: string; time: number }>()

const storageLocal: StorageLikeAsync = {
  removeItem(key: string) {
    writeCache.delete(key)
    return storage.local.remove(key)
  },

  setItem(key: string, value: string) {
    writeCache.set(key, { value, time: Date.now() })
    // NOTE: do NOT write to localStorage. With all_frames:true every frame runs
    // its own useStorageAsync instance. Writing to localStorage would fire the
    // 'storage' event in every other frame, each would read→merge→assign a new
    // object to data.value (triggering the watcher)→write again→infinite
    // cross-frame feedback loop → slider value oscillation.
    return storage.local.set({ [key]: value })
  },

  async getItem(key: string) {
    const cached = writeCache.get(key)
    if (cached !== undefined && Date.now() - cached.time < 1000)
      return cached.value
    writeCache.delete(key)
    return (await storage.local.get(key))[key]
  },
}

export function useStorageLocal<T>(key: string, initialValue: MaybeRef<T>, options?: UseStorageAsyncOptions<T>): RemovableRef<T> {
  return useStorageAsync(key, initialValue, storageLocal, options)
}
