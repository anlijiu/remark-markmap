////////////////////////////////////////////////////////////////////////////////////////////
// 来自
// https://stackoverflow.com/questions/59144286/fair-partitioning-of-elements-of-a-list
//
// 回溯是解决这个问题的一种可能性。
// 它允许递归地检查所有可能性，而不需要大量内存。
// 一旦找到最优解，它就会停止：sum = 0，其中sum是集合 A 的元素之和与集合 B
// 的元素之和之间的差。 编辑：它会立即停止sum < 2，以处理所有数字之和为奇数的情况，即对应于最小差为 1。
// 如果这个全局和是偶数，则最小差不能等于 1。
//
// 它允许实施一个简单的提前放弃程序：
// 在给定时间，如果sum高于所有剩余元素（即未放置在 A 或 B 中）的总和加上获得的当前最小值的绝对值，
// 那么我们可以放弃检查当前路径，而不检查剩余元素。
//
// 此程序通过以下方式优化：
//     按降序对输入数据进行排序
//     每一步，首先检查最可能的选择：这允许快速找到接近最优解
//
// 初始化：
//     对元素进行排序a[]
//     计算剩余元素的总和：sum_back[i] = sum_back[i+1] + a[i];
//     将最小“差异”设置为其最大值：min_diff = sum_back[0];
//     放入a[0]A -> 检查元素的索引i设置为 1
//     设置up_down = true;：此布尔值表示我们当前是前进（true）还是后退（false）
//
//  While 循环：
//     如果 (up_down)：前进
//         测试过早放弃，借助sum_back
//         选择最可能的值，并sum根据此选择进行调整
//         if (i == n-1)：LEAF -> 测试最佳值是否有所改善，如果新值等于 0 则返回（编辑：）if (... < 2)；向后走
//         如果不在叶子中：继续前进
//
//     如果 (!updown): 向后
//         如果我们到达i == 0：返回
//         如果是此节点中的第二次行走：选择第二个值，向上
//         否则：下降
//         在两种情况下：重新计算新sum值
////////////////////////////////////////////////////////////////////////////////////////////

import { log } from './logger'

export default function partition(a: number[]): [number, number[]] {
  log.debug('partition:    a: ', a)
  if (!Array.isArray(a) || a.length == 0) return [0, []]
  else if (a.length == 1) {
    return [a[0], [0]]
  }

  const n = a.length

  const parti = [] // current partition studies
  let parti_opt = [] // optimal partition
  const sum_back = [] // sum of remaining elements
  const n_poss = [] // number of possibilities already examined at position i

  parti[n - 1] = -1
  parti_opt[n - 1] = 0
  n_poss[n - 1] = 0
  sum_back[n - 1] = a[n - 1]
  for (let i = n - 2; i >= 0; --i) {
    sum_back[i] = sum_back[i + 1] + a[i]

    parti[i] = -1
    parti_opt[i] = 0
    n_poss[i] = 0
  }

  // 先拷贝再排序：不能原地修改调用方传入的数组
  a = [...a].sort(function (a1, a2) {
    return a2 - a1
  })

  log.debug(`parti: ${parti}`)
  log.debug(`parti_opt: ${parti_opt}`)
  log.debug(`sum_back: ${sum_back}`)
  log.debug(`n_poss: ${n_poss}`)

  parti[0] = 0 // a[0] in A always !
  let sum = a[0] // current sum

  let i = 1 // index of the element being examined (we force a[0] to be in A !)
  let min_diff = sum_back[0]
  let up_down = true

  while (true) {
    // UP
    if (up_down) {
      if (Math.abs(sum) > sum_back[i] + min_diff) {
        //premature abandon
        i--
        up_down = false
        continue
      }

      n_poss[i] = 1
      if (sum > 0) {
        sum -= a[i]
        parti[i] = 1
      } else {
        sum += a[i]
        parti[i] = 0
      }

      if (i == n - 1) {
        // leaf
        if (Math.abs(sum) < min_diff) {
          min_diff = Math.abs(sum)
          // 拷贝而非引用：parti 在后续回溯中还会被继续修改
          parti_opt = [...parti]
          if (min_diff < 2) return [min_diff, parti_opt] // EDIT: if (... < 2) instead of (... == 0)
        }
        up_down = false
        i--
      } else {
        i++
      }
    } else {
      // DOWN
      if (i == 0) break
      if (n_poss[i] == 2) {
        if (parti[i]) sum += a[i]
        else sum -= a[i]
        //parti[i] = 0;
        i--
      } else {
        n_poss[i] = 2
        parti[i] = 1 - parti[i]
        if (parti[i]) sum -= 2 * a[i]
        else sum += 2 * a[i]

        i++
        up_down = true
      }
    }
  }

  return [min_diff, parti_opt]
}
