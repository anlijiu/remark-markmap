# AI 贡献署名(AI Contribution Attribution)

> 所有 AI agent 向本仓提交代码变更时,必须如实披露自身身份与执行环境。
> 本规范是 [AGENTS.md](../AGENTS.md)「不要猜」纪律在署名维度的延伸:模型身份是事实,只能记录、不能推断。
> 目的:可追溯(哪批变更出自哪个 agent/模型,便于回溯模型相关的坏模式与回归)与可审计。
> 提交门禁本身(pre-commit/commitlint/CI)见 [gates.md](gates.md),本规范在其之上追加署名要求,不改变任何门禁。

## 1. 必填元数据(Required Metadata)

每一笔 AI 辅助的代码提交,必须能回答以下五个字段:

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| **Agent/Harness** | 所用的编码 agent 或 harness | Codex CLI、Claude Code、Reasonix、ZCode、OpenCode |
| **Model Provider** | 模型提供方 | OpenAI、Anthropic、DeepSeek、Zhipu |
| **Model** | 实现时实际使用的模型 ID | `gpt-5.x`、`deepseek-flash`、`glm-5.3` |
| **Runtime Framework** | agent 的执行框架,如适用 | Mastra、LangGraph、自建 runtime;不适用写 `N/A` |
| **Contribution** | agent 实际承担的贡献 | 实现、测试、重构、文档、评审…… |

- 前四项进入 commit trailer(§3);Contribution 写进提交说明或提交报告(§4)。
- Agent/Harness 与 Runtime Framework 是两个维度:前者是「谁在操作」,后者是「agent 跑在什么执行框架上」。
  Reasonix 跑在 Mastra 上时两者都要记;由人直接驱动的 CLI harness(如 Codex CLI)Runtime 写 `N/A`。

## 2. 准确性要求(Accuracy Requirements)

- **记录 runtime 或 API 请求实际暴露的模型 ID**——不是产品宣传名,不是印象里的版本。
- **永远不要从 agent 产品名推断模型**。harness 与模型是解耦的:同一个 Codex CLI 可以配置不同的底层模型;
  同名 agent 也可能随版本切换模型。「用了某个 agent」推不出「模型是哪个」。
- **无法核实的字段显式写 `unknown`**,禁止留空、禁止猜一个填上。`unknown` 是诚实记录,猜出来的 ID 是污染数据,后者危害大得多。
- **多模型或多 agent 实质性参与时,逐条分别列出**,不合并、不写「等」。
- **执行过程中模型发生变化时,记录所有实质参与的模型**(中途升级、降级、切换都算)。
- **区分 agent harness 与底层 runtime framework**(口径见 §1 末条)。

模型 ID 的可信来源,按优先级:

1. API 响应体里的 `model` 字段;
2. agent 运行时暴露的元数据或请求日志;
3. 显式配置文件中的模型声明。

三者都查不到就写 `unknown`。

## 3. Git Commit 署名(Git Commit Attribution)

凡包含**实质性** AI 生成或 AI 修改代码的 commit,footer 必须带署名 trailer,格式:

```text
Assisted-by: <Agent> | <Provider>/<Model> | Runtime: <Framework>
```

示例:

```text
Assisted-by: Reasonix | DeepSeek/deepseek-flash | Runtime: Mastra 1.83
Assisted-by: Codex CLI | OpenAI/gpt-5.x | Runtime: N/A
```

多主体实质参与时一行一条,叠写:

```text
Assisted-by: Reasonix | DeepSeek/deepseek-chat | Runtime: Mastra 1.83
Assisted-by: ZCode | Zhipu/glm-5.3 | Runtime: N/A
```

完整 commit 信息形态(trailer 与 body 之间空一行,归入 footer):

```text
fix(screener): 修复 catchup 窗口边界重叠

<动机、方案与验证结果……>

Assisted-by: ZCode | Zhipu/glm-5.3 | Runtime: N/A
```

本仓落地约束:

- trailer 属于 commit footer,受 commitlint `footer-max-line-length` 约束(每行 ≤100 字符,见
  [gates.md](gates.md))——超长时精简 Agent 名或 Framework 版本后缀,保持单行,不要折行破坏 trailer 格式。
- `Assisted-by` 是本仓选定的披露 trailer,不与 `Co-Authored-By` 混用:AI 不是作者,作者责任仍在提交人(§5)。
  与既有 `Signed-off-by` 并存,各表各的。

「实质性」(materially)的边界:

| 场景 | 需要署名? |
| --- | --- |
| AI 生成/修改了实现、测试、重构、文档的实质内容 | 需要 |
| AI 给出修复方案并被采纳落码 | 需要 |
| 人写的代码仅被工具链自动格式化(prettier / eslint --fix) | 不需要 |
| AI 仅被咨询意见,代码由人逐行写就 | 不需要 |

拿不准时一律署名——多署的成本是几行 metadata,漏署的成本是追溯链断裂。

## 4. 提交报告(Pull Request / Submission Report)

每一笔**非平凡**的 AI 辅助提交,必须附带提交报告,包含:

- Agent 与模型信息(§1 前三项);
- 运行时框架及版本;
- AI 贡献范围(哪些部分是 AI 做的);
- 修改的文件或模块;
- 测试与验证结果;
- 已知局限与未验证的假设。

本仓是个人仓库,多数变更直接提交 main、没有强制 PR 流程,等价载体按变更规模选:

- 小变更:上述要素写进 commit body;
- 大变更:在 `docs/` 下新建方案/评审文档(本仓库没有强制的 plan-spec 流程),提交报告要素在对应文档中体现。

「非平凡」的大致边界:涉及行为变更、依赖、schema、跨模块改动的算非平凡;错字、注释、纯格式化算平凡。
验证结果必须如实——测试失败、跳过的步骤、没跑过的检查都要写明,不许只报喜。

## 5. 责任归属(Responsibility)

- AI 署名**不替代**人工评审,也**不转移**人的责任。
- 提交开发者对变更的正确性、安全性、许可合规与可维护性负全责——「这是 AI 写的」不构成任何豁免。
- 提交门禁(pre-commit / commit-msg / CI,见 [gates.md](gates.md))对 AI 辅助提交照常适用,一级不少。
