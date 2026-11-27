import assert from 'node:assert/strict'
import test from 'node:test'

import partition from '../src/dp'

test('partition 不修改调用方传入的数组', () => {
  const input = [3, 1, 4, 1, 5]
  const snapshot = [...input]

  partition(input)

  assert.deepEqual(input, snapshot, '入参数组的顺序与内容必须保持不变')
})

test('partition 对边界输入返回稳定结构', () => {
  assert.deepEqual(partition([]), [0, []])
  assert.deepEqual(partition([7]), [7, [0]])
})

test('partition 返回的划分只含 0/1，且长度与入参一致', () => {
  const [diff, parts] = partition([2, 3, 5, 7])

  assert.ok(diff >= 0, '差值必须非负')
  assert.equal(parts.length, 4)
  assert.ok(
    parts.every((p) => p === 0 || p === 1),
    '划分结果只能是 0 或 1',
  )
})

test('partition 对奇数和能找到差值为 1 的划分', () => {
  // 1 + 2 + 4 = 7（奇数），最优只能差 1
  const [diff] = partition([1, 2, 4])
  assert.equal(diff, 1)
})

test('partition 对偶数和能找到差值为 0 的划分', () => {
  // 1 + 2 + 3 = 6，可分成 1+2 与 3，差 0
  const [diff] = partition([1, 2, 3])
  assert.equal(diff, 0)
})

test('partition 连续调用结果一致（无跨调用状态泄漏）', () => {
  const first = partition([4, 3, 2, 1])
  const second = partition([4, 3, 2, 1])

  assert.deepEqual(first, second)
})
