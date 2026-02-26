# HAQI Group 协作 + 记忆池 PRD 与开发计划

## 1. 文档信息
- 文档名: HAQI Group Collaboration + Memory Pool PRD
- 版本: v1.0
- 状态: Draft
- 日期: 2026-02-26
- 适用范围: hub / web / cli / shared

## 2. 背景与问题
当前 session 彼此独立，跨 session 协作依赖人工切换与复制上下文。
主要问题:
- 群级信息不可见，协作过程不可追踪。
- 指令分发缺少统一路由上下文，难以审计与排障。
- 记忆分散在各会话，长期与中期知识无法积累和复用。

## 3. 产品目标
- 提供 Group 级 Timeline，群内消息默认全员可见。
- 支持 `@session` 与 `@all` 指令分发到目标 session queue。
- 提供 Group Note 看板，由专属 note session 汇总最新进展。
- 构建分层记忆池（短期/中期/长期）并被动沉淀。

## 4. 非目标（当前版本不做）
- 不做 agent-to-agent 自动闭环执行。
- 不做跨 namespace 群组。
- 不做编辑历史版本化。
- 不做审批流强制拦截（先审计记录）。

## 5. 关键定义
- Group: 同 namespace 下的协作容器。
- Timeline: 群消息审计流，唯一协作日志。
- Group Task: 由指令路由创建的执行任务。
- Group Note: 群状态摘要（结论/进行中/风险/下一步）。
- Note Session: 专门维护 Group Note 的普通 session（可替换执行器）。

## 6. 阶段范围
### Phase 1: Group + Timeline + 路由
- Group 创建、成员管理、消息流。
- 用户消息默认写入 Timeline 并全员可见。
- `@session_xxx` 投递单 session 队列。
- `@all` 广播投递所有成员 session 队列。
- Note Session 自动或手动刷新 Group Note。

### Phase 1.5: Route Context（必须）
所有 command/task 相关消息统一携带:
- `groupId`: 群 ID。
- `taskId`: 单个任务 ID（每个目标 session 各一条）。
- `traceId`: 一次指令链路 ID（`@all` 共享同一个 traceId）。
- `source`: 消息来源。枚举建议: `user_web` / `user_telegram` / `agent_session` / `system_dispatcher` / `system_note_executor`。
- `targetSessionIds`: 目标 session 列表。

### Phase 2: 被动记忆沉淀
- 长期记忆: `MEMORY.md`
- 中期记忆: `memory/daily/YYYY-MM-DD.md`
- 短期记忆: `memory/sessions/<sessionId>/SESSION-STATE.md`
- 群摘要记忆: `memory/groups/<groupId>/GROUP-NOTE.md`
- 被动写入策略: 按消息/任务/Note 更新同步写入。

### Phase 3: 深度交互（规划）
- 记忆与群记录在面板可见可编辑。
- Group Note 支持按 session 记录职责与状态。
- 预留审批能力与版本化能力接口（后续开启）。

## 7. 功能需求
### FR-01 Group 管理
- 支持创建 Group、查看 Group 列表、查看 Group 详情。
- 支持维护群成员（session + human）。

### FR-02 Timeline
- 所有用户群消息必须写入 `group_messages`。
- Timeline 消息类型固定: `chat | command | task_state | note_state | system`。

### FR-03 Timeline 审计 Envelope
每条记录字段:
- `eventId`
- `groupId`
- `type`
- `traceId`
- `taskId`（可空）
- `source`
- `actorSessionId`（可空）
- `actorName`（可空）
- `targetSessionIds`（可空）
- `payload`
- `createdAt`

### FR-04 指令路由
- 非 `@` 消息: 只写 Timeline，不入队。
- `@session_xxx`: 创建 1 条 task，入指定队列。
- `@all`: 创建 N 条 task，分别入队，各 task 共用 traceId。

### FR-05 Note Session 与降级
- Group 绑定一个 `noteSessionId`。
- note session 在线: 自动刷新 note。
- note session 离线: 群页支持手动 `/note refresh` 按钮。
- 若唤醒失败: 写入 Timeline `system` 消息提示用户。

### FR-06 记忆池（Phase 2）
- 按路径规则落地 md 文件。
- session 属于 group 时，session state 包含 group note 摘要段。
- 日维度中期记忆自动归档到 daily 文件。

## 8. 技术方案
### 8.1 架构原则
- Hub 中央路由，不做 CLI 互连。
- Timeline 与 ExecQueue 解耦。
- 显式路由元数据，禁止文本猜测。
- 幂等、限流、TTL 防止队列污染。

### 8.2 数据模型（新增）
- `groups`
- `group_members`
- `group_messages`
- `group_tasks`
- `group_note`
- `memory_items`（Phase 2，可选先以文件系统为主，表做索引缓存）

### 8.3 task 状态机
- `pending -> enqueued -> running -> completed | failed | canceled | expired`

### 8.4 API（新增）
- `POST /api/groups`
- `GET /api/groups`
- `GET /api/groups/:id`
- `GET /api/groups/:id/messages`
- `POST /api/groups/:id/messages`
- `GET /api/groups/:id/tasks`
- `POST /api/groups/:id/tasks/:taskId/claim`
- `POST /api/groups/:id/tasks/:taskId/done`
- `POST /api/groups/:id/tasks/:taskId/cancel`
- `GET /api/groups/:id/note`
- `PATCH /api/groups/:id/note`
- `POST /api/groups/:id/note/refresh`

### 8.5 SSE 事件（新增）
- `group-added`
- `group-updated`
- `group-removed`
- `group-message-received`
- `group-task-updated`
- `group-note-updated`

### 8.6 与现有 CLI 队列集成
- 复用 Claude/Codex 现有 queue RPC 能力。
- enqueue 时注入 route context 到 message meta。
- agent 输出若携带 group task context，自动双写: session + group timeline。

## 9. 代码改造范围
### shared
- 扩展 `SyncEventSchema` 与 group 相关 schema。
- 扩展 `MessageMetaSchema`，新增 route context 字段。

### hub
- `store`: schema migration v5（groups/tasks/messages/note）。
- `sync`: 新增 `groupService` / `groupTaskDispatcher` / `groupNoteService`。
- `web/routes`: 新增 `groups.ts`。
- `sse/sseManager.ts`: 支持 group 订阅过滤。

### cli
- `api/types.ts`: MessageMetaSchema 新增 route context。
- remote queue 入队时携带路由上下文。
- note session 作为普通 session 运行，不引入特化进程类型。

### web
- 新路由: `/groups`, `/groups/:id`。
- 新组件: `GroupList`, `GroupChat`, `GroupNote`, `TaskPanel`。
- Composer 支持 `@session`、`@all` 标记与 command 样式。

## 10. 开发计划
### Milestone A（3-5 天）: 规格冻结与表结构
- 完成 schema 与 API 契约冻结。
- 完成 migration v5 草案与测试样例。
- 完成 route context 字段定义与兼容策略。

### Milestone B（5-7 天）: Phase 1 + 1.5 核心能力
- Hub group CRUD + timeline + task 路由。
- CLI 队列注入 route context。
- Web 群聊基础页面 + Timeline 展示。
- note session 基础刷新 + 手动 refresh。

### Milestone C（3-5 天）: Phase 2 记忆被动写入
- 文件系统目录落地与写入策略实现。
- session/group note 摘要同步写入。
- daily 记录自动落盘与基础 janitor。

### Milestone D（3-4 天）: 稳定性与验收
- 回归测试、压测、观测指标、失败重试。
- 灰度发布与开关控制。

## 11. 验收标准
- 群消息广播成功率 >= 99.9%。
- `@` 指令投递成功率 >= 99%。
- 非 `@` 消息误触发执行率 = 0。
- Group Note 可手动刷新且可见最新更新时间。
- route context 在任务链路可追踪率 = 100%。

## 12. 风险与缓解
- 风险: `@all` 导致队列积压。
- 缓解: 每 session 每 group `maxPending` + TTL + 去重键。

- 风险: note session 离线导致摘要中断。
- 缓解: 手动 `/note refresh` + 唤醒失败 system 提示。

- 风险: 记忆文件增长过快。
- 缓解: daily 分片 + janitor 清理 + 摘要 compounding。

## 13. HAQI-Agent.md 规范（执行规则文件）
文件分两块:
- `Group Rules`
- `Memory Rules`

启动注入策略:
- 启动时加载 `HAQI-Agent.md`。
- 若在 group 内，再附加当前 `GROUP-NOTE.md` 摘要段。
- 通过现有 Claude/Codex system/developer instructions 通道注入。

## 14. 立即执行清单
1. 先落地 Phase 1 + 1.5（group + route context）。
2. 再接入 Phase 2 被动记忆写入。
3. 最后推进 Phase 3 面板化编辑与协同增强。
