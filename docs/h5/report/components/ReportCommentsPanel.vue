<template>
  <section v-if="normalizedReportId" class="panel report-comments-panel">
    <view class="panel-title">{{ t('评论') }}</view>

    <view class="comment-editor">
      <view v-if="replyTarget" class="reply-target">
        <text class="reply-target-text">{{ t('回复给：{name}', { name: replyTarget.authorName || '-' }) }}</text>
        <text class="reply-target-cancel" @click="cancelReply">{{ t('取消回复') }}</text>
      </view>
      <textarea
        v-model="draft"
        class="comment-input"
        :placeholder="replyTarget ? t('写回复') : t('写评论')"
        maxlength="500"
      />
      <view class="comment-actions">
        <button v-if="replyTarget" class="comment-btn secondary" :disabled="saving" @click="cancelReply">{{ t('取消') }}</button>
        <button class="comment-btn" :disabled="saving || !draft.trim()" @click="submitComment">
          {{ saving ? t('提交中...') : (replyTarget ? t('提交回复') : t('提交评论')) }}
        </button>
      </view>
    </view>

    <view v-if="loading" class="comment-state">{{ t('加载中...') }}</view>
    <view v-else-if="!comments.length" class="comment-state">{{ t('暂无评论') }}</view>
    <ReportCommentTree
      v-else
      class="comment-list"
      :comments="comments"
      :deleting-id="deletingId"
      @reply="startReply"
      @delete="removeComment"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '../../../utils/i18n.js'
import { createReportComment, deleteReportComment, listCommentsByReport } from '../../../api/reportComments.js'
import { normalizeReportComments } from '../utils/detailPcInteractive.mjs'
import ReportCommentTree from './ReportCommentTree.vue'

const props = defineProps({
  reportId: { type: String, default: '' }
})

const { t } = useI18n()

const comments = ref([])
const loading = ref(false)
const saving = ref(false)
const deletingId = ref('')
const draft = ref('')
const replyTarget = ref(null)

const normalizedReportId = computed(() => String(props.reportId || '').trim())

watch(normalizedReportId, async (reportId) => {
  comments.value = []
  draft.value = ''
  replyTarget.value = null
  if (!reportId) return
  await loadComments()
}, { immediate: true })

function notify(message) {
  const text = String(message || '').trim()
  if (!text) return
  if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
    uni.showToast({ title: text, icon: 'none', duration: 2400 })
    return
  }
  if (typeof globalThis.showToast === 'function') {
    globalThis.showToast(text)
    return
  }
  console.log(text)
}

async function loadComments() {
  if (!normalizedReportId.value) return
  loading.value = true
  try {
    const data = await listCommentsByReport(normalizedReportId.value)
    comments.value = normalizeReportComments(data)
  } catch (error) {
    console.error('加载报告评论失败:', error)
    notify(error?.message || t('加载评论失败'))
  } finally {
    loading.value = false
  }
}

function startReply(comment) {
  replyTarget.value = comment || null
  draft.value = ''
}

function cancelReply() {
  replyTarget.value = null
  draft.value = ''
}

async function submitComment() {
  const content = String(draft.value || '').trim()
  if (!normalizedReportId.value || !content) return
  saving.value = true
  try {
    await createReportComment({
      reportId: normalizedReportId.value,
      targetId: normalizedReportId.value,
      parentId: replyTarget.value?.id || null,
      content
    })
    notify(t('提交成功'))
    cancelReply()
    await loadComments()
  } catch (error) {
    console.error('提交报告评论失败:', error)
    notify(error?.message || t('提交评论失败'))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (typeof uni !== 'undefined' && typeof uni.showModal === 'function') {
    return new Promise((resolve) => {
      uni.showModal({
        title: t('删除评论'),
        content: t('确定删除这条评论吗？'),
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      })
    })
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(t('确定删除这条评论吗？'))
  }
  return false
}

async function removeComment(comment) {
  const id = String(comment?.id || '').trim()
  if (!id || deletingId.value) return
  const confirmed = await confirmDelete()
  if (!confirmed) return
  deletingId.value = id
  try {
    await deleteReportComment(id)
    if (replyTarget.value?.id === id) cancelReply()
    notify(t('删除成功'))
    await loadComments()
  } catch (error) {
    console.error('删除报告评论失败:', error)
    notify(error?.message || t('删除评论失败'))
  } finally {
    deletingId.value = ''
  }
}
</script>

<style scoped lang="scss">
.report-comments-panel {
  margin-top: 18px;
}

.comment-editor {
  margin-top: 12px;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  padding: 14px;
  background: #f8fbff;
}

.comment-input {
  width: 100%;
  min-height: 92px;
  border: none;
  resize: vertical;
  background: transparent;
  font-size: 14px;
  line-height: 1.6;
  color: #0f172a;
}

.reply-target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #e0f2fe;
}

.reply-target-text {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}

.reply-target-cancel {
  color: #2563eb;
  font-size: 12px;
}

.comment-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.comment-btn {
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
}

.comment-btn.secondary {
  background: #e2e8f0;
  color: #334155;
}

.comment-btn:disabled {
  opacity: .55;
}

.comment-state {
  margin-top: 14px;
  color: #64748b;
  font-size: 13px;
}

.comment-list {
  margin-top: 14px;
}
</style>
