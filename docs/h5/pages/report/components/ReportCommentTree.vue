<template>
  <view class="comment-tree">
    <view
      v-for="comment in comments"
      :key="comment.id"
      :class="level > 0 ? 'reply-card' : 'comment-card'"
    >
      <view class="comment-card-head">
        <view>
          <text class="comment-author">{{ comment.authorName || '-' }}</text>
          <text class="comment-time">{{ comment.updatedAt || comment.createdAt || '-' }}</text>
        </view>
        <view class="comment-card-actions">
          <text class="comment-action" @click="$emit('reply', getReplyTarget(comment))">
            {{ level > 0 ? t('继续回复') : t('回复') }}
          </text>
          <text class="comment-action danger" @click="$emit('delete', comment)">
            {{ deletingId === comment.id ? t('删除中...') : t('删除') }}
          </text>
        </view>
      </view>

      <view class="comment-content">{{ comment.content || '-' }}</view>

      <view v-if="comment.replies?.length" class="reply-list">
        <ReportCommentTree
          :comments="comment.replies"
          :deleting-id="deletingId"
          :level="level + 1"
          :thread-root="threadRoot || comment"
          @reply="$emit('reply', $event)"
          @delete="$emit('delete', $event)"
        />
      </view>
    </view>
  </view>
</template>

<script setup>
import { useI18n } from '../../../utils/i18n.js'

defineOptions({ name: 'ReportCommentTree' })

const props = defineProps({
  comments: { type: Array, default: () => [] },
  deletingId: { type: String, default: '' },
  level: { type: Number, default: 0 },
  threadRoot: { type: Object, default: null }
})

defineEmits(['reply', 'delete'])

const { t } = useI18n()

function getReplyTarget(comment) {
  if (props.level > 0) return props.threadRoot || comment
  return comment
}
</script>

<style scoped lang="scss">
.comment-tree {
  display: grid;
  gap: 12px;
}

.comment-card,
.reply-card {
  border-radius: 12px;
  padding: 14px;
  background: #fff;
}

.comment-card {
  border: 1px solid #e2e8f0;
}

.reply-card {
  border-left: 3px solid #bfdbfe;
  padding-left: 12px;
}

.comment-card-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.comment-author {
  display: block;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
}

.comment-time {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
}

.comment-card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.comment-action {
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
}

.comment-action.danger {
  color: #dc2626;
}

.comment-content {
  margin-top: 12px;
  color: #334155;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.reply-list {
  margin-top: 12px;
}
</style>
