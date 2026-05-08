# 一个 AGENT 文档让你的 Codex 和 Claude Code 想清楚再做事

本文介绍 `karpathy-guidelines` 这个技能怎么用，以及为什么建议把它写进你的 `AGENTS.md`、`CLAUDE.md` 或项目级 AI 规则里。

这个技能的目标不是让 Agent 变得啰嗦，而是减少大模型写代码时最常见的几类翻车：

- 没搞清需求就开始写。
- 明明 50 行能解决，写成 200 行。
- 顺手重构一堆无关文件。
- 没跑测试就说“应该好了”。

`karpathy-guidelines` 的核心思想很简单：先想清楚，再少写代码，只改必要部分，最后用可验证结果收尾。

## 为什么要用这个技能

AI 写代码很快，但快不等于稳。越是复杂代码库，越容易出现这些问题：

- **过度自信**：需求有歧义时，Agent 直接替你做决定。
- **过度设计**：为了显得专业，添加没被要求的配置、抽象、兼容层。
- **污染改动范围**：本来只改一个按钮，顺手格式化半个项目。
- **缺少验证**：看起来能运行，但没有测试、构建或手动验证证据。

`karpathy-guidelines` 会强制 Agent 做四件事：

1. 写代码前先说明假设和不确定点。
2. 用最少代码解决当前问题，不做未来幻想。
3. 只碰和任务直接相关的文件。
4. 把任务变成可验证目标，跑完检查再结束。

这非常适合长期维护的项目。你不是在追求“AI 一次生成很多代码”，你是在追求“AI 生成的代码你敢合并”。

## 什么时候使用

推荐在这些场景启用：

- 写新功能。
- 修 bug。
- 重构已有代码。
- 做代码审查。
- 修改配置、脚本、接口或数据库逻辑。
- 让 Agent 接手一个你不想被它乱改的老项目。

不一定需要启用的场景：

- 一次性草稿。
- 纯创意脑暴。
- 不进入代码库的简单问答。
- 明确允许随便试错的原型实验。

如果你不确定要不要用，那就用。这个技能的代价只是让 Agent 慢一点，但能换来更小、更可控、更容易审查的改动。

## 怎么在 Codex 里使用

如果你的 Codex 已经安装了这个技能，可以直接在对话里点名：

```text
[$karpathy-guidelines] 请帮我修复登录页按钮点击无响应的问题。
```

也可以在普通话术里写清楚：

```text
请使用 karpathy-guidelines。
先确认你的假设，只做最小必要改动，最后运行验证命令。
```

更适合团队项目的方式，是把下面的规则放到项目根目录的 `AGENTS.md`：

````md
# Agent Guidelines

## Karpathy-Inspired Coding Guidelines

### 1. Think Before Coding

Before implementing:
- State assumptions explicitly.
- If the request is ambiguous, ask before editing.
- If multiple interpretations exist, list them instead of silently choosing.

### 2. Simplicity First

- Use the minimum code that solves the problem.
- Do not add speculative features, configuration, or abstractions.
- Do not handle impossible scenarios just to look thorough.

### 3. Surgical Changes

- Touch only files required by the request.
- Match the existing project style.
- Do not refactor unrelated code.
- Clean up only unused code created by your own change.

### 4. Goal-Driven Execution

For non-trivial tasks, state:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Before finishing, run the relevant verification command and report the result.
````

这样每次 Agent 进入仓库时，都会先读到这套约束。

## 怎么在 Claude Code 里使用

Claude Code 通常会读取项目里的 `CLAUDE.md`。你可以把同样的规则放进去，或者写得更短：

```md
# Claude Code Rules

Use karpathy-style coding discipline:

- Think before coding. State assumptions and ask when requirements are ambiguous.
- Keep solutions simple. Do not add unrequested abstractions or features.
- Make surgical changes. Do not refactor unrelated files.
- Define success criteria and verify before claiming completion.
```

如果你的项目同时给 Codex 和 Claude Code 使用，可以同时保留：

- `AGENTS.md`：给 Codex、通用 AI coding agent。
- `CLAUDE.md`：给 Claude Code。

两份文件可以内容一致。重点不是文件名多高级，而是让 Agent 在动手前看到规则。

## 推荐提问方式

差的提问：

```text
帮我优化一下这个项目。
```

问题是“优化”太大，Agent 很容易乱改。

更好的提问：

```text
请使用 karpathy-guidelines。
目标：修复 payment 页面额度卡片右上角缺少赠送标签的问题。
约束：只改 payment 页面相关文件，不改支付逻辑。
验证：运行构建，最后告诉我改了哪些文件。
```

这类提问给了 Agent 三件关键东西：

- 目标：要解决什么。
- 边界：不要碰什么。
- 验证：怎么证明完成。

## 一个可复制的任务模板

```text
请使用 karpathy-guidelines 完成这个任务。

目标：
[写清楚最终要达成什么]

约束：
- 只改和任务直接相关的文件
- 不做无关重构
- 不添加未要求的功能

成功标准：
- [标准 1]
- [标准 2]
- [标准 3]

验证方式：
- [例如 npm run build / npm test / 手动检查页面]
```

## 使用后的检查清单

Agent 交付后，你可以按这张清单快速判断它有没有遵守：

- 有没有先说明假设或不确定点？
- 有没有只改必要文件？
- 有没有新增不需要的抽象或配置？
- 有没有删除、格式化、重构无关代码？
- 有没有说明验证命令和结果？
- 每个改动是否都能对应到你的原始需求？

如果答案里出现大量“顺便”“我也优化了”“为了未来扩展”，你就该警惕了。大多数维护型任务里，这些词往往意味着改动范围失控。

## 总结

`karpathy-guidelines` 不是让 Agent 少做事，而是让它做对事。

它适合用在真实项目里，尤其是你希望 AI 像一个谨慎的高级工程师，而不是一个兴奋的新手那样工作时。

一句话记住：

```text
先想清楚，少写代码，只改必要部分，用验证结果说话。
```
