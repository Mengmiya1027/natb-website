# Issue 页接口契约（冻结，任何成员不得修改本文件）

## 全局约定

- Vue 3 `<script setup>`，业务代码用纯 JS，不写 TS。
- 样式优先用 Tailwind 工具类；颜色只允许用主题变量映射出的语义类
  （`bg-background` `text-foreground` `bg-card` `text-muted-foreground` `border-border`
  `bg-primary` `text-primary-foreground` `bg-accent` `bg-destructive` `ring-ring` 等），
  **禁止硬编码色值**，配色由 shadcn-vue preset 统一定义。
- UI 组件只用 `@/components/ui/<name>` 里已存在的 shadcn-vue 组件（见下），不要引入其它 UI 库。
- 图标：`import IconX from '~icons/lucide/x'`（unplugin-icons，构建期编译）。
- 提示：`import { toast } from 'vue-sonner'`，`toast.success/error('文案')`。
- 所有页面内容必须位于 `class="natb-issue"` 的祖先之下，样式作用域靠它保证。
- 禁止新增 npm 依赖；确实需要时报告给 lead，不要自己装。

## 已可用的 UI 组件

`button` `badge` `avatar` `input` `textarea` `label` `separator` `skeleton` `card`
`dialog` `dropdown-menu` `select` `tabs` `tooltip` `popover` `switch` `checkbox`
`scroll-area` `alert` `alert-dialog` `collapsible` `pagination` `sonner` `toggle`

导入形如 `import { Button } from '@/components/ui/button'`。

## 数据层（已就绪，直接用，不要改）

### `@/api/github.js`

```js
export class GitHubError extends Error { status; payload }
export const githubApi = {
  getRepo(), listIssues({state,labels,assignee,milestone,sort,direction,page,per_page}), getIssue(n),
  listComments(n,{page,per_page}), listTimeline(n,{page,per_page}), search(q,{sort,order,page,per_page}),
  listLabels({per_page}), listMilestones({state,per_page}), listAssignableUsers({per_page}),
  listCollaborators({per_page}), getPermission(login), getMe(), getSubscription(n), listReactions(n),
}
export const githubWriteApi = {
  createIssue({title,body,labels,assignees,milestone}), updateIssue(n,patch), closeIssue(n,reason), reopenIssue(n),
  setLabels(n,labels), createComment(n,body), updateComment(id,body), deleteComment(id),
  lockIssue(n), unlockIssue(n), addReaction(n,content), removeReaction(n,reactionId),
  setSubscription(n), deleteSubscription(n),
  createLabel({name,color,description}), updateLabel(name,patch), deleteLabel(name),
  createMilestone({title,description,due_on,state}), updateMilestone(n,patch), deleteMilestone(n),
  setAssignees(n,assignees), pinIssue(n), unpinIssue(n), deleteIssue(n),
}
export function getToken(), getProxyBase(), setProxyBase(v), isProxyEnabled(), probeConnection(base)
export function getRateLimit()
```

### `@/stores/issue.js` — `useIssueStore()`

状态：`user` `token` `authState` `authError` `permission` `isLoggedIn` `isOwner` `canManage`
`canWrite` `proxyBase` `rate` `themeMode` `resolvedTheme`

动作：`bootstrap()` `refreshPermission()` `loginWithToken(t)` `beginDeviceLogin()`
`completeDeviceLogin(flow,{onTick,signal})` `logout()` `updateProxyBase(base)` `syncRate(v)`
`applyTheme()` `setThemeMode(m)` `clearTheme()`

### 配置 `@/config/github.js`

`ISSUE_REPO` `ISSUE_REPO_FULL` `ISSUE_REPO_URL` `OAUTH_CLIENT_ID` `OWNER_LOGINS`

## 组件契约

宿主是 `src/pages/Issues.vue`（**lead 独占，任何人不得修改**）。
它按下面的签名渲染各组件，签名即契约。

| 组件 | 归属 | props | emits |
|---|---|---|---|
| `IssueFilters.vue` | issue-list | `modelValue`（筛选对象）`stats`（{open}） | `update:modelValue` |
| `IssueList.vue` | issue-list | `filters` | `open(number)` `create` |
| `IssueListItem.vue` | issue-list | `issue` | `open(number)` |
| `IssueDetail.vue` | issue-detail | `number:Number` | `back` `changed` `open(number)` |
| `IssueTimeline.vue` | issue-detail | `events:Array` `comments:Array` | `open(number)` |
| `IssueComment.vue` | issue-detail | `comment:Object` `events:Array` | `edit(id,body)` `delete(id)` `reply(login)` |
| `MarkdownView.vue` | issue-detail | `content:String` | — |
| `IssueEditor.vue` | issue-write | — | `created(number\|null)` `cancel` |
| `MarkdownEditor.vue` | issue-write | `modelValue:String` `placeholder:String` `minHeight:String` | `update:modelValue` `submit` |
| `CommentComposer.vue` | issue-write | `issueNumber:Number` `replyTo:String` | `submitted` `cancel` |
| `LabelPicker.vue` | issue-write | `modelValue:Array` | `update:modelValue` |
| `AssigneePicker.vue` | issue-write | `modelValue:Array` | `update:modelValue` |
| `MilestonePicker.vue` | issue-write | `modelValue:Number\|null` | `update:modelValue` |
| `IssueSidebarActions.vue` | issue-write | `issue:Object` | `changed` |
| `IssueAdminPanel.vue` | issue-admin | — | `close` |

筛选对象形状（由 `IssueFilters` 维护，`IssueList` 只读）：

```js
{ state: 'open'|'closed'|'all', labels: string[], milestone: ''|number,
  assignee: '', sort: 'created'|'updated'|'comments', direction: 'desc'|'asc', search: '' }
```

`MarkdownView` 是详情与编辑器预览共用的渲染组件，issue-write 可 `import` 使用但**不得修改**。

## 文件边界

- issue-list：`src/components/issue/IssueFilters.vue`、`IssueList.vue`、`IssueListItem.vue`
- issue-detail：`IssueDetail.vue`、`IssueTimeline.vue`、`IssueComment.vue`、`MarkdownView.vue`
- issue-write：`IssueEditor.vue`、`MarkdownEditor.vue`、`CommentComposer.vue`、`LabelPicker.vue`、`AssigneePicker.vue`、`MilestonePicker.vue`、`IssueSidebarActions.vue`
- issue-admin：`IssueAdminPanel.vue`、`LabelManageDialog.vue`、`MilestoneManageDialog.vue`
- lead 独占：`src/pages/Issues.vue`、`src/stores/issue.js`、`src/api/**`、`src/config/**`、`src/styles/**`、`src/components/ui/**`、`NavBar.vue`、`HarnessDock.vue`、`App.vue`、本文件

**只能改自己名下的文件。** 需要别人文件改动时，报告给 lead，不要动手。

## 交付要求

- 每个组件写完要能独立成立：无未定义引用、无占位 TODO。
- 不跑 `npm run build`（dist 会被并发写坏），由 lead 统一构建。
- 完成后报告：改了哪些文件、实现了哪些能力、已知限制。
