export function createCaptureCompletionGuard(onFinish) {
  let resultProcessing = false
  let finished = false

  const finish = () => {
    resultProcessing = false
    if (finished) return
    finished = true
    onFinish?.()
  }

  return {
    beginResult() {
      if (finished) return false
      resultProcessing = true
      return true
    },
    complete() {
      if (!resultProcessing) finish()
    },
    finish
  }
}
