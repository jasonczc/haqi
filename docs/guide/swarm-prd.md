# HAQI Swarm PRD（v0.1）

## 1. 文档信息
- 名称: HAQI Swarm PRD
- 版本: v0.1
- 状态: Implemented
- 日期: 2026-03-11
- 适用范围: hub / web / cli / shared

## 1.1 实现状态（2026-03-11）
Swarm v0.1 已在 HAQI 中完成主干落地：

- 已有独立顶层板块 `Swarms`
- 已有独立数据模型与数据库表
- 已接入 session 作为 participant
- 已支持 swarm -> session dispatch
- 已支持 session -> swarm outcome / activity 回流
- 已支持 work item / outcome / artifact / transition / event
- 已支持 group broadcast
- 已支持 report 作为 artifact 导入
- 已支持 activity / role binding / thread / policy 骨架
- 已支持 effect tool call 与 first-class swarm effects
- 已支持列表页、详情页、timeline、decision board、work item detail

本 PRD 作为 v0.1 的设计与实现基线保留；后续增强进入 v0.2 范围。

补充（2026-03-11，后续实现）：

- 已实现 work item assignment / participant lease
- 已实现 auto-assign / auto-reassign skeleton
- 已实现 planner auto-split / auto-plan-on-define
- 已实现 dynamic role rebinding
- 已实现 thread entry runtime、auto rebuttal、auto decision
- 已实现 review-request policy loop
- 已实现 autonomy policy / budget / stop condition
- 已实现 web 控制面：
  - run policies
  - pause/resume autonomy
  - policy config JSON editing

当前状态可视为：

> Swarm v0.1 主干 + v0.2 自治编排主干，已在 HAQI 中落地完成。

## 2. 一句话定义
Swarm 是一个独立于 Session / Group 的协作系统：

> 围绕同一 Subject，由多个 Participant 持续产生 Outcome，并推动状态转移，直到形成可验收的交付结果。

## 3. 为什么要有 Swarm
现有对象边界：

- Session: 单个 agent / 单条交互运行时
- Group: 多主体共享可见性的沟通空间
- Swarm: 复杂任务的协作推进与交付系统

Swarm 解决的问题：

- 复杂任务不能只靠单线程 Session
- 多主体协作不能只靠消息流 Group
- 需要一个能承载：并发推进、局部讨论、阶段收敛、交付验收 的新对象

## 4. 设计原则
### 4.1 大道至简
Swarm 不先定义：
- 用户应该点什么
- 哪个模型天然做什么
- 页面上一定有哪些按钮

Swarm 先定义：
- 什么主体存在
- 什么活动可以发生
- 什么产物会产生
- 什么状态会变化

### 4.2 模型无关
不把 Claude / Codex / Gemini 绑定为固定工种。
差异压缩到 adapter 边界。

### 4.3 产物导向
Swarm 的核心不是 message feed，而是：
- outcome
- decision
- artifact

### 4.4 可回环
Swarm 不是线性流水线；允许在验证失败、信息不足、用户改需求时回到前一阶段。

## 5. 核心概念（Core Ontology）
### 5.1 Swarm
协作顶层容器。

字段建议：
- `id`
- `namespace`
- `title`
- `subjectId`
- `status`
- `currentPhase`
- `createdBy`
- `createdAt`
- `updatedAt`

### 5.2 Subject
Swarm 围绕的对象；先统一抽象，不急于细分成需求/任务/PR。

字段建议：
- `id`
- `swarmId`
- `kind` (`goal` | `question` | `change` | `delivery`)
- `summary`
- `successCriteria`
- `constraints`
- `status`

### 5.3 Participant
参与者。

可以是：
- human
- agent
- service

字段建议：
- `id`
- `swarmId`
- `kind`
- `refId`
- `provider`
- `model`
- `capabilities`
- `availability`

### 5.4 Activity
围绕 Subject 发生的活动类型。

建议第一版固定：
- `explore`
- `propose`
- `implement`
- `verify`
- `summarize`
- `coordinate`

注意：
Activity 不是“谁应该做什么”，只是系统允许发生的活动类型。

### 5.5 Outcome
Swarm 的最小推进单位。

建议支持：
- `proposal`
- `decision`
- `diff`
- `report`
- `test_result`
- `question`
- `blocker`
- `summary`

字段建议：
- `id`
- `swarmId`
- `subjectId`
- `kind`
- `status`
- `createdByParticipantId`
- `content`
- `artifactRefs`
- `createdAt`
- `updatedAt`

### 5.6 Transition
状态转移事件。

例如：
- subject: `open -> active`
- proposal: `pending -> accepted`
- work: `running -> blocked`
- artifact: `draft -> verified`
- swarm: `explore -> decide`

字段建议：
- `id`
- `swarmId`
- `entityType`
- `entityId`
- `fromState`
- `toState`
- `reason`
- `byParticipantId`
- `createdAt`

## 6. 主干流程（极简）
第一版只保留 4 段：

1. `define`
2. `explore`
3. `decide`
4. `deliver`

### 6.1 define
明确 subject、边界、成功标准。

### 6.2 explore
并发地探索、提案、实现、验证局部结果。

### 6.3 decide
把 explore 产出的 proposal / blocker / summary 收敛成 decision。

### 6.4 deliver
围绕 artifact 验收，必要时回到 explore / decide。

## 7. 健康判定
一个 Swarm 是否在推进，不看消息数，而看：

- 是否持续产生 Outcome
- 是否发生有效 Transition
- 是否存在长期未收敛 Blocker
- 是否形成可验收 Artifact

## 8. 与 Session / Group 的关系
### 8.1 Session -> Swarm
Session 可以被绑定为 Swarm Participant。
Session 仍是单个运行时，不升格为 Swarm 本身。

### 8.2 Group -> Swarm
Group 可以作为：
- Swarm 的可见性入口
- Swarm 的广播面
- Swarm 的外部讨论面

但 Group 不是 Swarm 的主干数据模型。

### 8.3 Swarm -> Session / Group
Swarm 可以：
- 派生出 Session 工作线程
- 向 Group 广播阶段事件 / 决策摘要 / 交付状态

## 9. 在 HAQI 里的落地建议
### 9.1 顶层导航新增独立板块
新增一级导航：
- `Swarms`

与：
- `Sessions`
- `Groups`

并列。

### 9.2 第一版新增数据对象
建议新增：
- `swarms`
- `swarm_subjects`
- `swarm_participants`
- `swarm_outcomes`
- `swarm_transitions`
- `swarm_artifacts`
- `swarm_events`

可选二期：
- `swarm_role_bindings`
- `swarm_threads`
- `swarm_policies`

### 9.3 第一版页面信息架构
#### `/swarms`
列表页，显示：
- title
- currentPhase
- status
- latest outcome
- updatedAt

#### `/swarms/:id`
详情页只保留 4 个主区域：
- Overview
- Outcomes
- Artifacts
- Event Timeline

不先做复杂 agent 群聊 UI。

### 9.4 第一版与现有对象的复用
- 复用现有 session runtime 作为 participant 执行体
- 复用现有 report 能力作为 artifact / summary 承载
- 复用现有 SSE 机制推送 swarm events
- 复用现有 group 作为 swarm 的广播出口（可选）

## 10. API 草案
### 基础
- `POST /api/swarms`
- `GET /api/swarms`
- `GET /api/swarms/:id`
- `PATCH /api/swarms/:id`

### Subject
- `GET /api/swarms/:id/subject`
- `PATCH /api/swarms/:id/subject`

### Participants
- `GET /api/swarms/:id/participants`
- `POST /api/swarms/:id/participants`
- `DELETE /api/swarms/:id/participants/:participantId`

### Outcomes
- `GET /api/swarms/:id/outcomes`
- `POST /api/swarms/:id/outcomes`
- `PATCH /api/swarms/:id/outcomes/:outcomeId`

### Artifacts
- `GET /api/swarms/:id/artifacts`
- `POST /api/swarms/:id/artifacts`

### Transitions / Events
- `GET /api/swarms/:id/events`
- `POST /api/swarms/:id/transitions`

## 11. SSE 事件草案
- `swarm-added`
- `swarm-updated`
- `swarm-outcome-updated`
- `swarm-artifact-updated`
- `swarm-transition-created`
- `swarm-event-created`

## 12. 实施路径
### Phase A: 数据骨架
- shared: swarm schema / event schema
- hub/store: swarm tables + migrations
- hub/routes: swarm CRUD + outcomes + events
- web: swarms 列表页 +详情页骨架

状态：已完成

### Phase B: 运行时接入
- 把 session 绑定为 participant
- 允许 swarm 记录 session 产出的 outcome / artifact
- 允许 swarm 通过 group 广播摘要

状态：已完成（artifact 自动沉淀以 report/import + 手动挂接为主）

### Phase C: 协作增强
- role binding
- thread 视图
- policy / escalation
- 与 hosted task 深度整合

状态：已完成基础骨架；hosted task 深度整合留待 v0.2

## 13. 非目标（v0.1 不做）
- 不做“完整 AI 群聊自治 UI”
- 不做模型品牌级固定分工
- 不做复杂投票算法
- 不做过多 phase 细分
- 不做过多产品按钮预设

## 14. 成功标准
Swarm v0.1 成功，不是看“聊得多”，而是看：

- HAQI 中出现独立的 `Swarms` 板块
- 能创建 Swarm 并保存 Subject
- 能记录 Participant / Outcome / Artifact / Transition
- 能在页面看到一个任务从 define -> explore -> decide -> deliver 的主干推进
- 能与现有 Session / Group 发生清晰边界的连接

当前状态：以上主干成功标准已满足。

## 14.1 已实现对象清单
- `swarms`
- `swarm_subjects`
- `swarm_participants`
- `swarm_outcomes`
- `swarm_work_items`
- `swarm_artifacts`
- `swarm_transitions`
- `swarm_events`
- `swarm_effects`
- `swarm_activities`
- `swarm_role_bindings`
- `swarm_threads`
- `swarm_policies`

## 14.2 已实现页面
- `/swarms`
- `/swarms/:id`

详情页当前已包含：
- Overview
- Work Items
- Decision Board
- Work Item Detail
- Dispatch
- Broadcast to Group
- Outcomes
- Artifacts
- Activities
- Role Bindings
- Threads
- Policies
- Timeline

## 15. 最终判断
Swarm 不应该被设计成：
- Session 的增强版
- Group 的增强版
- 一个更热闹的 agent chat room

Swarm 应该被设计成：

> 一个面向复杂任务协作交付的独立系统。

## 16. 演进路径（v0.2+）
v0.1 完成的是：

- 独立对象模型
- 协作记录与交付主干
- session/runtime 接入
- work item / outcome / artifact / review / timeline

后续演进目标，不再只是“记录协作”，而是进入：

> 从协作记录系统，演进为协作编排系统。

### 16.1 三个核心引擎
后续 Swarm 的增强，建议收敛为 3 个运行时引擎：

1. **Planner / Split Engine**
   - 自动分裂
   - 自动派发
   - 持续再分配

2. **Deliberation / Thread Engine**
   - thread 级提案
   - 引用 / rebuttal / decision
   - 协商收敛

3. **Orchestration / Role Engine**
   - phase 自动重绑定
   - 按能力选 agent
   - bind / unbind 策略执行

---

### 16.2 演进原则
#### A. 先结构化，再自治
先把 thread / assignment / role binding 等结构化对象做清楚，再逐步加入自治能力。

#### B. 先 bounded autonomy，再 full autonomy
先做有边界的自动拆分、自动分配、自动回退；不要一开始就做完全自治 swarm。

#### C. 模型无关
自动分派与角色绑定基于 capability / availability / current load，而不是把 Claude / Codex / Gemini 写死成工种。

---

### 16.3 演进阶段
#### Stage 1: Assisted Autonomy
目标：
- Swarm 可自动拆分 work items
- Swarm 可自动给 participant 分配任务
- 关键节点仍可人工确认

能力：
- planner activity 产出 structured work plan
- work item assignment
- dispatch policy
- 初步 reassignment

#### Stage 2: Bounded Autonomy
目标：
- Swarm 在 policy 范围内自主运行多轮

能力：
- lease / timeout / heartbeat
- 自动 reassign
- review verdict 驱动回退 / 继续
- escalation policy

#### Stage 3: Self-Organizing Autonomous Swarm
目标：
- Swarm 自己起 planning / deliberation / review 循环

能力：
- 自动起 thread
- 自动生成 proposal / rebuttal / decision
- 自动重算角色
- 自动完成阶段推进

---

### 16.4 推荐实现顺序
#### Step 1: 升级 threads 为真正协商线程
现状：
- `swarm_threads` 只是展示骨架

目标：
- proposal / blocker / decision 真正挂在线程上
- 支持 reply / cite / rebuttal / synthesis

建议新增：
- `thread_entries`

建议 entry 类型：
- `proposal`
- `blocker`
- `question`
- `evidence`
- `rebuttal`
- `decision`

#### Step 2: 引入 Planner / Split Engine
目标：
- 根据 subject / current phase / open blockers / participants 自动生成 structured work plan

建议 planner 输出：
- `title`
- `intent`
- `expectedArtifact`
- `doneCriteria`
- `requiredCapabilities`
- `priority`
- `deps`

#### Step 3: 引入 Assignment Engine
目标：
- 按能力、可用性、负载自动选 participant

建议基于：
- capabilities
- availability
- current load
- role fit
- provider preference

#### Step 4: 引入 Reassignment / Lease
目标：
- 任务不是只派发一次，而是可以持续再分配

建议新增：
- `work_item_assignments`
- `participant_leases`

触发条件：
- participant inactive
- work item 超时无活动
- review `changes_requested`
- blocker 长期未收敛

#### Step 5: 引入 Dynamic Role Binding
目标：
- role binding 从静态记录升级为 runtime policy

能力：
- 随 phase 自动重绑
- planner / implementer / reviewer / coordinator 动态切换
- bind / unbind 可审计

建议新增：
- `role_binding_history`

---

### 16.5 推荐新增运行时对象
下一阶段优先级最高的新增对象：

1. `thread_entries`
2. `work_item_assignments`
3. `participant_leases`
4. `role_binding_history`

说明：
- `planner_output` 第一阶段可先保存在 `activity.content` 中，不一定单独建表

---

### 16.6 对应产品能力
这些机制落地后，Swarm 才会更明显体现：

- 蜂群合作：多个 participant 自主分工与再分工
- 协商：thread 级提案、反驳、收敛
- 并行：多个 work items 自动并发推进
- 自组织：角色随阶段与状态自动重编排

---

### 16.7 v0.2 边界建议
v0.2 推荐收敛为以下目标：

- thread/rebuttal 数据结构
- auto-split / auto-assign / reassign
- dynamic role binding
- bounded autonomy policy

不建议在 v0.2 直接追求：

- 无限轮自治讨论
- 复杂投票算法
- 完全无边界的 self-organizing swarm

更合适的目标是：

> 先让 Swarm 成为“有边界的自动协作编排系统”。


## 17. Tool Call 规范（副作用回流）
### 17.1 为什么需要 Tool Call
当前 Swarm 已实现：
- 编排
- 调度
- 角色绑定
- policy / autonomy
- session -> swarm message / outcome 回流

但不同后端（Claude Code / Codex / Gemini）对执行副作用的暴露能力不同。
如果直接按后端设计一套完整副作用协议，会过于繁琐。

因此推荐新增一层：

> 用少量 HAQI 内建 Tool Call，让 agent 主动提交“语义后效”；
> runtime 再兜底捕获“确定性后效”。

### 17.2 设计原则
#### A. 贴合 Swarm ontology
Tool Call 不按模型品牌设计，而按 Swarm 的核心抽象设计：
- Activity
- Outcome
- Artifact
- Review

#### B. Tool Call 不替代 runtime
Tool Call 负责：
- 语义性结果
- 阶段性结论
- 结构化产物声明

runtime 负责：
- 文件变更
- 命令执行
- permission
- 其他确定性副作用

#### C. 少量工具
第一版只引入少量稳定工具；避免把副作用协议做得过重。

### 17.3 推荐工具集（v0.1）
说明：以下为 HAQI MCP 的基础 tool 名；实际调用时，具体前缀由运行后端决定（例如 namespaced MCP tool）。

#### 1. `record_activity`
用途：记录当前活动。

参数建议：
- `swarmId`
- `workItemId?`
- `kind` (`explore` | `propose` | `implement` | `verify` | `summarize` | `coordinate`)
- `status` (`open` | `completed` | `failed`)
- `summary?`
- `content?`

映射：
- `SwarmActivity`

#### 2. `record_outcome`
用途：记录语义产出。

参数建议：
- `swarmId`
- `subjectId?`
- `workItemId?`
- `kind` (`proposal` | `decision` | `diff` | `report` | `test_result` | `question` | `blocker` | `summary`)
- `status`
- `content`
- `artifactRefs?`

映射：
- `SwarmOutcome`

#### 3. `record_artifact`
用途：记录可验收产物。

参数建议：
- `swarmId`
- `workItemId?`
- `kind` (`report` | `diff` | `patch` | `document` | `test_result` | `link` | `file_bundle`)
- `title`
- `url?`
- `content?`
- `status`

映射：
- `SwarmArtifact`

#### 4. `record_review`
用途：记录 review / verifier 结论。

参数建议：
- `swarmId`
- `workItemId?`
- `artifactId?`
- `verdict` (`approved` | `changes_requested` | `commented`)
- `summary?`
- `evidence?`

映射：
- `SwarmReview`

#### 5. `record_effect`
用途：兜底；暂时无法归类到上述对象的副作用。

参数建议：
- `swarmId?`
- `workItemId?`
- `kind` (`native` | `progress` | `file_change` | `permission` | `delegation` | `other`)
- `summary?`
- `data?`
- `raw?`

映射：
- 初期只落原始 effect / event；后续再决定是否投影为正式对象。

### 17.4 与 runtime 自动捕获的边界
#### 优先由 Tool Call 上报的内容
- proposal
- blocker
- summary
- decision
- review verdict
- artifact 声明

#### 优先由 runtime 自动捕获的内容
- 文件改动
- patch 生成
- 命令执行结果
- permission 请求
- assignment / lease / reassign

原则：

> 语义后效，优先 Tool Call；
> 确定性后效，优先 runtime。

### 17.5 与 Role Profile / Skills 的关系
Role Profile 中应加入工具使用约束：

#### planner
- 形成提案 / 决策时，优先调用 `record_outcome`

#### implementer
- 完成阶段性实现时，优先调用：
  - `record_activity`
  - `record_artifact`

#### reviewer
- 完成验收时，必须调用 `record_review`

#### coordinator
- 发现阻塞 / 推进节点时，优先调用：
  - `record_activity`
  - `record_outcome`（`blocker` / `summary`）

因此：
- role profile 决定“什么时候该上报”
- skill 决定“如何完成任务”
- tool call 决定“如何把结果回流到 HAQI”

### 17.6 对不同后端的兼容方式
不要求 Claude Code / Codex / Gemini 暴露同样高保真的副作用数据。

兼容策略：
- 所有后端：都可调用相同 HAQI tool calls
- 能力强的后端：再叠加 runtime 自动捕获
- 能力弱的后端：至少保证语义产出可通过 tool call 回流

也就是说：

> Tool Call 提供跨后端统一最小面；
> runtime 自动捕获提供高保真增强。

### 17.7 推荐实施顺序
#### Phase 1
先落 3 个工具：
- `record_outcome`
- `record_artifact`
- `record_review`

原因：
- 最直接对应收敛 / 交付 / 验收
- 与现有 Swarm 数据模型最贴合

#### Phase 2
补：
- `record_activity`

#### Phase 3
最后补：
- `record_effect`
- runtime effect auto-capture
- contract / validator 更强联动


### 17.7.1 Tool Call -> API 映射
第一版推荐直接复用现有 Swarm API：

| Tool Call | Hub API | 映射对象 |
|---|---|---|
| `record_activity` | `POST /api/swarms/:id/activities` | `SwarmActivity` |
| `record_outcome` | `POST /api/swarms/:id/outcomes` | `SwarmOutcome` |
| `record_artifact` | `POST /api/swarms/:id/artifacts` | `SwarmArtifact` |
| `record_review` | `POST /api/swarms/:id/reviews` | `SwarmReview` |
| `record_effect` | `POST /api/swarms/:id/effects`（新增） | 原始 effect / event |

调用方式建议：
- 模型调用 HAQI Tool Call
- Tool handler 内部调用 Hub API
- 不让模型直接理解 REST 细节

也就是：

> 对模型暴露高层 tool；
> 对系统内部复用现有 API。

### 17.8 最终判断
对于副作用回流，推荐方案不是：
- 为每个后端设计一整套独立协议

而是：

> 用少量 HAQI Tool Call 承接语义后效；
> 再由 runtime 自动补齐确定性副作用。

这更简单，也更符合当前 Swarm PRD 的抽象边界。


### 17.9 调用时机规则
原则：

> Tool Call 只在“形成阶段性后效”时触发；
> 不为每条消息触发，不为每个细粒度步骤触发。

#### A. `record_activity`
触发时机：
- 开始调研 / 完成调研
- 开始实现 / 完成实现
- 开始验证 / 完成验证
- 协调 / 分派一个新动作

不建议：
- 每读一个文件都调用
- 每条普通回复都调用
- 每个小步骤都调用

建议规则：
- 一个连续工作段，最多记录 `started` / `completed` 两次

#### B. `record_outcome`
触发时机：
- 形成 proposal
- 确认 blocker
- 给出 decision
- 形成阶段 summary
- 抛出明确 question

不建议：
- 普通对话内容
- 尚未收敛的随手想法
- 与已有 outcome 无新增信息的重复内容

建议规则：
- 只有“值得进入 Swarm 决策面 / 记忆面”的内容才记录为 outcome

#### C. `record_artifact`
触发时机：
- 形成 diff / patch
- 形成 report / 文档
- 形成测试结果产物
- 形成可打开 URL / bundle / file refs

不建议：
- 尚未形成独立产物
- 只是说“我准备写”
- 纯语义总结但无 artifact 实体

建议规则：
- 当其他 participant 可以基于该结果进行 review / verify 时，才记录 artifact

#### D. `record_review`
触发时机：
- `approved`
- `changes_requested`
- `commented`（含明确证据）

不建议：
- 还在浏览 / 还在思考
- 随口评价但未形成 verdict

建议规则：
- review 只记录结论，不记录浏览过程

#### E. `record_effect`
触发时机：
- 前 4 类都不合适
- 但确实产生了重要副作用
- 暂时无法稳定标准化

建议规则：
- `effect` 只作为兜底，不作为主上报通道

### 17.10 角色级调用规则
#### planner
优先：
- `record_outcome`

典型触发：
- proposal
- decision
- blocker
- summary

#### implementer
优先：
- `record_activity`
- `record_artifact`
- 必要时 `record_outcome(blocker)`

#### reviewer
优先：
- `record_review`

#### coordinator
优先：
- `record_activity`
- `record_outcome`（`blocker` / `summary`）

### 17.11 阶段级调用规则
#### define
优先：
- `record_outcome`（`proposal` / `question` / `summary`）

#### explore
优先：
- `record_activity`
- `record_artifact`
- `record_outcome`（`proposal` / `blocker`）

#### decide
优先：
- `record_outcome`（`decision` / `summary`）

#### deliver
优先：
- `record_artifact`
- `record_review`

### 17.12 去重与更新规则
为了避免 HAQI 被重复上报污染，建议增加以下规范：

#### A. 同一 work item、同一 kind、同一轮执行，避免重复创建
例如：
- 同一个 diff 不应连续创建多个 artifact
- 同一个 blocker 不应重复创建多个相同 outcome

#### B. 能更新就不新增
例如：
- 已存在 blocker，则优先补充内容或更新状态
- 已存在 summary，则优先合并为阶段总结

#### C. Message 不等于 Tool Call
- 普通消息流不自动等于 tool call
- Tool Call 只用于阶段性后效

### 17.13 最小判定流程
推荐在 role instructions / skill instructions 中内置以下判断顺序：

1. 这次执行是否形成可复用结论？
   - 是 -> `record_outcome`
2. 这次执行是否形成可验收产物？
   - 是 -> `record_artifact`
3. 这次执行是否形成明确验收 verdict？
   - 是 -> `record_review`
4. 这次执行是否只是阶段活动节点？
   - 是 -> `record_activity`
5. 都不是，但确有重要副作用？
   - `record_effect`
6. 如果都不是：
   - 不调用 Tool Call
