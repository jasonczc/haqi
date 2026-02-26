# 左侧栏Group Name间距调整完成

## 用户反馈
- 左边栏目的group name可以left margin大一点，左边留一点空白

## 实现的改动

### 调整Group Name左边距 ✅
**文件**: `web/src/router.tsx`
**位置**: GroupsLayout组件中的groups列表渲染
**修改**:
- 从 `px-3` 改为 `pl-5 pr-3`
- 增加了左边距，右边距保持不变

### 代码变更
```typescript
// 修改前
className={`w-full px-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)] ${selectedGroupId === item.group.id ? 'bg-[var(--app-subtle-bg)]' : ''}`}

// 修改后
className={`w-full pl-5 pr-3 py-3 text-left transition-colors hover:bg-[var(--app-subtle-bg)] ${selectedGroupId === item.group.id ? 'bg-[var(--app-subtle-bg)]' : ''}`}
```

## 视觉效果

**修改前**:
```
│Groups│
├─Group A
├─Group B
```

**修改后**:
```
│Groups│
├──Group A    ← 左边多了空白
├──Group B    ← 左边多了空白
```

## 技术细节
- 左边距从12px (px-3) 增加到20px (pl-5)
- 右边距保持12px (pr-3)
- 保持所有hover和选中状态样式
- TypeScript类型检查通过

现在左侧栏的group name会有更多的左边空白，视觉上更加舒适！