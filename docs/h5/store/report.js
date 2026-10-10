import { defineStore } from 'pinia'

export const useReportStore = defineStore('report', {
  state: () => ({
    currentReportId: '',
    dirtyPlanIds: [],
    pendingPhotoCount: 0
  }),
  getters: {
    pendingSyncCount: (state) => state.dirtyPlanIds.length
  },
  actions: {
    selectReport(reportId) {
      this.currentReportId = reportId
    },
    markPlanDirty(planId) {
      const id = String(planId || '').trim()
      if (id && !this.dirtyPlanIds.includes(id)) {
        this.dirtyPlanIds.push(id)
      }
    },
    markPlanSynced(planId) {
      const id = String(planId || '').trim()
      const idx = this.dirtyPlanIds.indexOf(id)
      if (idx !== -1) this.dirtyPlanIds.splice(idx, 1)
    },
    addPhotos(n = 1) {
      this.pendingPhotoCount += n
    },
    removePhotos(n = 1) {
      this.pendingPhotoCount = Math.max(0, this.pendingPhotoCount - n)
    }
  }
})
