import { computed, isRef, ref, unref, watch } from 'vue'

export const ADMIN_PAGE_SIZE_OPTIONS = [20, 50, 100]
export const DEFAULT_ADMIN_PAGE_SIZE = 20

const normalizePageSize = (value) => Math.max(1, Number.parseInt(value, 10) || DEFAULT_ADMIN_PAGE_SIZE)

export const useAdminPagination = (items, options = {}) => {
  const currentPage = options.currentPage || ref(1)
  const pageSize = isRef(options.pageSize)
    ? options.pageSize
    : ref(normalizePageSize(options.pageSize))

  const totalItems = computed(() => {
    const value = unref(items)
    return Array.isArray(value) ? value.length : 0
  })

  const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value))

  const pagedItems = computed(() => {
    const value = unref(items)
    const list = Array.isArray(value) ? value : []
    const start = (currentPage.value - 1) * pageSize.value
    return list.slice(start, start + pageSize.value)
  })

  const resetPage = () => {
    currentPage.value = 1
  }

  const clampPage = () => {
    const lastPage = Math.max(totalPages.value, 1)
    if (currentPage.value > lastPage) {
      currentPage.value = lastPage
    }
  }

  watch(totalPages, clampPage)

  if (options.resetOnPageSizeChange !== false) {
    watch(pageSize, resetPage)
  }

  const resetSources = Array.isArray(options.resetOn)
    ? options.resetOn
    : options.resetOn
      ? [options.resetOn]
      : []

  if (resetSources.length) {
    watch(resetSources, resetPage)
  }

  return {
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    pagedItems,
    resetPage,
    clampPage
  }
}
