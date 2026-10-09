import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const viewModel = await loadUtsModule('domain/reportCommentsViewModel.uts')

test('normalizes comment rows with H5 field fallbacks', () => {
  const rows = [
    {
      commentId: 'c-1',
      commentContent: '第一页包装需复核',
      createByName: '张三',
      createDate: '2026-09-01 10:00:00',
      updateDate: '2026-09-02 09:30:00',
      replies: [
        { id: 'c-1-1', content: '已复核，无异常', creatorName: '李四', createdAt: '2026-09-01 11:00:00' }
      ]
    }
  ]

  const comments = viewModel.normalizeReportComments(rows)

  assert.equal(comments.length, 1)
  assert.equal(comments[0].id, 'c-1')
  assert.equal(comments[0].content, '第一页包装需复核')
  assert.equal(comments[0].authorName, '张三')
  assert.equal(comments[0].createdAt, '2026-09-01 10:00:00')
  assert.equal(comments[0].updatedAt, '2026-09-02 09:30:00')
  assert.equal(comments[0].replies.length, 1)
  assert.equal(comments[0].replies[0].id, 'c-1-1')
  assert.equal(comments[0].replies[0].authorName, '李四')
})

test('unwraps paged comment payload variants', () => {
  const payloads = [
    { records: [{ id: 'a' }] },
    { rows: [{ id: 'b' }] },
    { list: [{ id: 'c' }] },
    { data: [{ id: 'd' }] },
    { items: [{ id: 'e' }] },
    [{ id: 'f' }]
  ]
  payloads.forEach((payload, index) => {
    const comments = viewModel.normalizeReportComments(payload)
    assert.ok(Array.isArray(comments), `payload ${index} should normalize to array`)
    assert.equal(comments.length, 1)
  })
  assert.equal(viewModel.normalizeReportComments(null).length, 0)
})

test('flattens nested replies into two-level threads and resolves reply target', () => {
  const normalized = viewModel.normalizeReportComments([
    {
      id: 'root-1',
      content: '根评论',
      createByName: 'A',
      replies: [
        {
          id: 'mid-1',
          content: '一级回复',
          createByName: 'B',
          replies: [{ id: 'deep-1', content: '二级回复', createByName: 'C' }]
        }
      ]
    },
    { id: 'root-2', content: '另一个主题', createByName: 'D' }
  ])

  const threads = viewModel.buildCommentThreads(normalized)

  assert.equal(threads.length, 2)
  assert.equal(threads[0].replies.length, 2)
  assert.equal(threads[0].replies[0].id, 'mid-1')
  assert.equal(threads[0].replies[0].replyToName, 'A')
  assert.equal(threads[0].replies[1].id, 'deep-1')
  assert.equal(threads[0].replies[1].replyToName, 'B')
  assert.equal(threads[1].replies.length, 0)
  assert.deepEqual(viewModel.resolveReplyTarget(threads, 'deep-1'), threads[0])
  assert.deepEqual(viewModel.resolveReplyTarget(threads, 'root-2'), threads[1])
  assert.equal(viewModel.resolveReplyTarget(threads, 'missing'), null)
})

test('validates comment draft content', () => {
  assert.deepEqual(viewModel.validateCommentContent('  '), { valid: false, message: '评论内容不能为空' })
  assert.deepEqual(viewModel.validateCommentContent('a'.repeat(501)), { valid: false, message: '评论内容不能超过500字' })
  assert.equal(viewModel.validateCommentContent('a'.repeat(500)).valid, true)
  assert.equal(viewModel.validateCommentContent(' 正常评论 ').valid, true)
})

test('builds report comment submit params', () => {
  const params = viewModel.buildReportCommentParams({ reportId: ' r-1 ', content: '  hello  ', parentId: ' c-9 ' })
  assert.deepEqual(params, {
    reportId: 'r-1',
    targetId: 'r-1',
    targetType: 'REPORT',
    parentId: 'c-9',
    content: 'hello'
  })

  assert.equal(viewModel.buildReportCommentParams({ reportId: 'r-1', content: 'hi' }).parentId, null)
  assert.throws(() => viewModel.buildReportCommentParams({ reportId: '', content: 'hi' }), /缺少报告ID/)
  assert.throws(() => viewModel.buildReportCommentParams({ reportId: 'r-1', content: '' }), /评论内容不能为空/)
})
