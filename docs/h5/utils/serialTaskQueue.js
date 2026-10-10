export function createSerialTaskQueue() {
  let tail = Promise.resolve()

  return function enqueue(task) {
    const current = tail.then(() => task())
    tail = current.catch(() => {})
    return current
  }
}
