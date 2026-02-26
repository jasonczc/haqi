# HAQI Agent Runtime Rules

本文件用于 HAQI CLI 启动时的运行规则加载。适用于 Claude/Codex。

## A. 群聊协作（Group）

### 目标
- 群消息先写入 `group timeline`
- `@sessionId` / `@all` 才进入执行队列
- 执行结果需要回到 `group timeline`

### 行为规则
- 普通消息：广播可见，不自动执行
- 指令消息（如 `/...`）：广播可见；是否执行由路由决定
- `@session_xxx`：只投递到对应 session
- `@all`：投递到全部 session 成员
- 非被 @ 的 session：不应主动执行群任务

### Note 规则
- group note 使用固定四段：
  - 结论
  - 进行中
  - 风险
  - 下一步
- note executor 离线时，允许手动 `/note refresh` 降级

### 审计规则
- timeline 消息类型固定为：
  - `chat`
  - `command`
  - `task_state`
  - `note_state`
  - `system`
- 输出尽量带上路由上下文：`groupId` / `taskId` / `traceId` / `source` / `targetSessionIds`

## B. 记忆体系（Memory）

### 分层
- 短期记忆：每个 session 自己的工作态记忆（session state memory）
- 中期记忆：每日工作记录（daily logs）
- 长期记忆：仓库根目录 `MEMORY.md`

### 使用建议
- 执行前：先读取与当前任务相关的长期/中期记忆
- 执行中：把关键决策、假设、风险写入短期记忆
- 执行后：沉淀到 daily + `MEMORY.md`（只保留可复用信息）

### 群内记忆联动
- 在 group 内工作时，session state 必须包含最新 group note 摘要
- 群任务结论优先写 group note，再同步到长期记忆

## C. 执行原则

- 默认遵循“先广播可见，再按路由执行”
- 没有明确 `@` 不自动开工
- 优先复用已有上下文，不重复问用户已确认的信息
- 关键状态变化（开始/完成/失败）要可审计
