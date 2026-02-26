# Group Detail页面UI简化完成

## 用户反馈
- 群组名称和"Add Member"按钮在头部是多余的（左侧栏已有）
- 应该直接展示一排群成员，后面有加号按钮
- 底部横线应该与左侧栏对齐

## 实现的改动

### 1. 移除冗余的Header部分 ✅
**移除内容**:
- 群组名称和描述显示
- 独立的"Add Member"按钮

**理由**: 左侧栏已经显示群组信息，避免重复

### 2. 简化Members Row ✅
**修改前**:
- 只有在有members时才显示整个row
- 大的"Add Member"按钮

**修改后**:
- 总是显示members row
- 成员pills + 圆形加号按钮
- 加号按钮样式: 虚线边框，hover时变为实线

### 3. 统一对齐所有横线 ✅
**调整的padding**:
- Members Row: `px-4` → `px-3`
- Group Note按钮: `px-4` → `px-3`
- Group Note内容: `px-4` → `px-3`
- Timeline消息: `px-2` → `px-3`
- Composer区域: `px-4` → `px-3`
- 错误信息: `px-4` → `px-3`

## UI结构对比

### 修改前
```
┌─ Header: "群组名称 - Add Member按钮" ──┐
├─ Members Row (仅在有成员时显示)        │
├─ Group Note                           │
├─ Timeline                             │
└─ Composer                             ┘
```

### 修改后
```
├─ Members Row: [成员1][成员2][+]         │
├─ Group Note                           │
├─ Timeline                             │
└─ Composer                             ┘
```

## 视觉改进

1. **更简洁**: 移除重复信息
2. **更一致**: 所有内容区域左对齐
3. **更直观**: 加号按钮紧跟在成员列表后
4. **更紧凑**: 减少垂直空间占用

## 用户体验

- ✅ **减少认知负荷**: 去除重复的群组信息显示
- ✅ **更直观的交互**: 加号按钮位置更自然
- ✅ **视觉对齐**: 所有内容边界统一
- ✅ **保持功能**: 所有原有功能均保留

## 技术细节

- 保持了AddMemberModal的完整功能
- 保持了成员点击跳转到session的功能
- 保持了所有现有的状态管理和错误处理
- TypeScript类型安全无变化