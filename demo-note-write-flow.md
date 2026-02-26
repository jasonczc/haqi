# Group Note部分写入机制设计

## 方式2：消息驱动写入 (推荐)

### 消息格式约定
Session发送特殊格式消息到群组：
```
/note-update inProgress "正在分析用户需求，已完成数据模型设计"
/note-update risks "数据库性能可能成为瓶颈"
/note-update nextSteps "需要完成API接口设计 (@session_abc)"
```

### 工作流程详解

1. **发送阶段**
```typescript
// Session在群组中发送消息
{
  type: 'command',
  payload: {
    command: '/note-update',
    section: 'inProgress',
    content: '正在分析用户需求，已完成数据模型设计',
    sessionId: 'session_123'
  }
}
```

2. **解析阶段**
```typescript
// Hub的groupService识别note-update命令
if (message.type === 'command' && payload.command === '/note-update') {
  await this.updateGroupNoteSection({
    groupId,
    section: payload.section,
    content: payload.content,
    updatedBy: payload.sessionId
  })
}
```

3. **存储阶段**
```sql
-- 分段存储group note
CREATE TABLE group_note_sections (
  group_id TEXT,
  namespace TEXT,
  section_type TEXT, -- 'inProgress', 'risks', 'nextSteps'
  content TEXT,
  updated_by TEXT, -- session_id
  updated_at INTEGER,
  version INTEGER,
  PRIMARY KEY (group_id, namespace, section_type)
);
```

4. **广播阶段**
```typescript
// 广播到timeline，让所有session可见
{
  type: 'note_state',
  payload: {
    action: 'section_updated',
    section: 'inProgress',
    content: '正在分析用户需求...',
    updatedBy: 'session_123'
  }
}
```

5. **同步阶段**
```typescript
// 定期合并各段落为完整note
const fullNote = await this.assembleGroupNote(groupId, namespace)
await this.store.groups.updateGroupNote({
  groupId, namespace,
  content: fullNote,
  updatedBy: 'system'
})
```

### 闭环机制
- ✅ **可见性**: 所有写入都在timeline中可见
- ✅ **一致性**: 通过版本控制避免冲突
- ✅ **可审计**: 每个section更新都有记录
- ✅ **自然集成**: 融入现有消息流程

## 方式3：分布式写入 + 定时合并

### 核心思想
每个session维护自己的"工作记录"，系统定时合并生成group note

### 工作流程
```
Session → 写入个人工作记录 → 定时器触发 → 收集所有记录 → AI合并生成note
```

### 数据结构
```sql
CREATE TABLE session_work_logs (
  session_id TEXT,
  group_id TEXT,
  namespace TEXT,
  content TEXT, -- session的工作记录
  updated_at INTEGER,
  PRIMARY KEY (session_id, group_id, namespace)
);
```

### 合并算法
```typescript
async mergeWorkLogsToGroupNote(groupId: string, namespace: string) {
  const workLogs = await this.getActiveSessionWorkLogs(groupId, namespace)

  const prompt = `
  基于以下各session的工作记录，生成统一的group note：

  ${workLogs.map(log => `
  Session ${log.sessionId}:
  ${log.content}
  `).join('\n')}

  请按照四段结构输出：结论、进行中、风险、下一步
  `

  // 发送给note executor处理
  const noteContent = await this.executeNoteRefresh(prompt)
  return noteContent
}
```

## 方式4：通过Note Executor代理

### 核心思想
所有session的写入请求都转发给note executor处理

### 工作流程
```
Session → 请求写入某段落 → 转发给note executor → note executor执行写入 → 广播结果
```

### 消息格式
```typescript
// Session发送写入请求
{
  type: 'note_write_request',
  payload: {
    section: 'risks',
    content: '数据库性能可能成为瓶颈',
    requestedBy: 'session_123'
  }
}

// Note executor处理后广播
{
  type: 'note_state',
  payload: {
    action: 'section_updated',
    section: 'risks',
    content: '更新后的风险段落内容',
    processedBy: 'session_note_executor'
  }
}
```

## 推荐方案对比

| 方案 | 复杂度 | 一致性 | 实时性 | 扩展性 |
|-----|-------|--------|--------|--------|
| 方式2: 消息驱动 | 中 | ✅ | ✅ | ✅ |
| 方式3: 分布式合并 | 高 | ✅ | ⚠️ | ✅ |
| 方式4: 代理模式 | 低 | ✅ | ✅ | ⚠️ |

**推荐：方式2 (消息驱动)**
- 符合现有架构
- 过程透明可审计
- 实现复杂度适中
- 扩展性好