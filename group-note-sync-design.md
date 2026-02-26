# Group Note 同步到 Session 记录设计

## 需求分析
让每个 group member session 的 agent 都能读取到最新的 group note 内容，实现 `HAQI-Agent.md` 中的："session state 必须包含最新 group note 摘要"

## 数据结构设计

### Session存储位置选择
```typescript
// 方案A: 存储在 session.metadata 中
{
  metadata: {
    flavor: 'claude',
    name: 'Session Name',
    path: '/project/path',
    // 新增group相关信息
    groupContext?: {
      groupId: string,
      groupName: string,
      noteContent: string,     // group note内容
      noteVersion: number,     // group note版本
      noteSyncedAt: number,    // 同步时间戳
      noteExecutor: string,    // note executor session id
      myRole: string           // 本session在group中的角色
    }
  }
}

// 方案B: 存储在 session.agentState 中
{
  agentState: {
    // 现有agent状态...
    groupMemory?: {
      activeGroups: Array<{
        groupId: string,
        noteDigest: string,    // note摘要（压缩版）
        lastSyncAt: number,
        myResponsibilities: string[]
      }>
    }
  }
}
```

## 同步机制设计

### 触发时机
1. **Group note更新时** - 立即同步到所有member session
2. **Session加入group时** - 初始同步group note
3. **Session启动时** - 检查group note是否有更新
4. **定时同步** - 每10分钟检查一次（避免遗漏）

### 同步流程
```typescript
// 在 groupService.ts 中
async syncGroupNoteToMembers(groupId: string, namespace: string) {
  const groupDetail = await this.getGroupWithDetails(groupId, namespace)
  if (!groupDetail.note) return

  const members = groupDetail.members.filter(m => m.sessionId)

  for (const member of members) {
    await this.syncNoteToSession(member.sessionId, groupDetail)
  }
}

async syncNoteToSession(sessionId: string, groupDetail: GroupWithDetails) {
  const session = await this.sessionCache.getSession(sessionId)
  if (!session) return

  const currentMetadata = session.metadata || {}
  const updatedMetadata = {
    ...currentMetadata,
    groupContext: {
      groupId: groupDetail.group.id,
      groupName: groupDetail.group.name,
      noteContent: groupDetail.note.content,
      noteVersion: groupDetail.note.version,
      noteSyncedAt: Date.now(),
      noteExecutor: groupDetail.group.noteSessionId,
      myRole: findMyRole(sessionId, groupDetail.members)
    }
  }

  // 更新session metadata
  await this.sessionCache.updateSessionMetadata(sessionId, () => updatedMetadata)
}
```

## Agent读取机制

### CLI侧agent如何读取
当agent启动时，metadata中的groupContext会被注入到系统prompt中：

```typescript
// 在 buildPromptWithHaqiAgentInstructions 中增强
export function buildPromptWithHaqiAgentInstructions(
  basePrompt: string,
  startDir: string,
  sessionMetadata?: any  // 新增参数
): string {
  const instructions = loadHaqiAgentInstructions(startDir)
  let prompt = basePrompt

  // 注入group context
  if (sessionMetadata?.groupContext) {
    const ctx = sessionMetadata.groupContext
    const groupPrompt = `
# Current Group Context

You are working in group "${ctx.groupName}" (${ctx.groupId}).

## Latest Group Note:
${ctx.noteContent}

## Your Role: ${ctx.myRole}
## Note Executor: ${ctx.noteExecutor}
## Last Synced: ${new Date(ctx.noteSyncedAt).toISOString()}

When working on group tasks, refer to the group note for context and coordination.
`
    prompt = `${prompt}\n\n${groupPrompt}`
  }

  if (instructions) {
    const preface = trimIdent(`
      Follow workspace operating rules in HAQI-Agent.md for group collaboration and memory usage.
      Treat them as runtime policy for this repository.
    `)
    prompt = `${prompt}\n\n${preface}\n\n<haqi-agent-instructions>\n${instructions}\n</haqi-agent-instructions>`
  }

  return prompt
}
```

### Hub侧如何传递metadata
```typescript
// 在 syncEngine.ts 的 dispatchGroupTask 中
const session = this.sessionCache.getSession(payload.targetSessionId)
const routeContext = {
  groupId: payload.groupId,
  taskId: payload.taskId,
  traceId: payload.traceId,
  source: payload.source,
  targetSessionIds: [payload.targetSessionId],
  // 从session metadata中提取group context
  groupNote: session?.metadata?.groupContext?.noteContent?.slice(0, 500)
}
```

## 性能优化

### 增量同步
```typescript
// 只在note version变化时才同步
async syncGroupNoteToMembers(groupId: string, namespace: string) {
  const groupDetail = await this.getGroupWithDetails(groupId, namespace)
  if (!groupDetail.note) return

  const currentVersion = groupDetail.note.version
  const members = groupDetail.members.filter(m => m.sessionId)

  for (const member of members) {
    const session = await this.sessionCache.getSession(member.sessionId)
    const syncedVersion = session?.metadata?.groupContext?.noteVersion || 0

    // 只同步版本更新的session
    if (currentVersion > syncedVersion) {
      await this.syncNoteToSession(member.sessionId, groupDetail)
    }
  }
}
```

### 内容压缩
```typescript
function compressNoteForAgent(content: string): string {
  // 保留关键信息，压缩到500字符以内
  if (content.length <= 500) return content

  // 提取关键段落
  const sections = content.split(/##\s+/)
  const summary = sections.map(section => {
    const lines = section.split('\n').slice(0, 2) // 每段只保留前2行
    return lines.join('\n')
  }).join('\n---\n')

  return summary.slice(0, 500) + '...'
}
```

## 实现步骤

1. **扩展session metadata结构** - 添加groupContext字段
2. **实现同步方法** - syncGroupNoteToMembers, syncNoteToSession
3. **修改note更新流程** - 在updateGroupNote后触发同步
4. **增强agent prompt注入** - 将groupContext注入到system prompt
5. **优化routeContext传递** - 携带压缩版note内容

## 验证方法
1. 更新group note后，检查所有member session的metadata是否同步
2. Agent执行任务时，验证system prompt中包含group note内容
3. 多个session并发时，确保note同步无冲突
4. Session重启后，能正确读取到最新group note