/**
 * Issue 页的静态配置。
 * 换仓库、换 OAuth App、换加速地址都只改这一个文件。
 */

/** issue 所在的仓库 */
export const ISSUE_REPO = {
  owner: 'Mengmiya1027',
  name: 'NATB-Cli-issue',
}

export const ISSUE_REPO_FULL = `${ISSUE_REPO.owner}/${ISSUE_REPO.name}`
export const ISSUE_REPO_URL = `https://github.com/${ISSUE_REPO_FULL}`

/**
 * GitHub OAuth App 的 Client ID。
 * Device Flow 只需要 Client ID，不需要 client secret —— 这是纯静态站唯一能安全落地的登录方式。
 * 留空时页面自动降级为「粘贴 Personal Access Token」登录。
 */
export const OAUTH_CLIENT_ID = 'Ov23liHYdV2VzwEF0q8f'

/** Device Flow 与 PAT 需要的权限：公开仓库读写 + 读用户资料 */
export const OAUTH_SCOPES = 'public_repo read:user'

/** 一键创建 PAT 的链接（预填好 scope），用于没有中转时的降级登录 */
export const PAT_CREATE_URL =
  'https://github.com/settings/tokens/new?scopes=public_repo,read:user&description=' +
  encodeURIComponent('NATB Issue 网站登录')

/** 站点公开地址，OAuth App 的 Homepage URL 用它 */
export const SITE_URL = 'https://mengmiya1027.github.io/natb-website/'

/**
 * 加速中转地址，留空表示直连 api.github.com。
 *
 * 默认走已部署的 Cloudflare Worker（绑了自有域名，本机与国内都能直连）。
 * 不再区分开发/生产：workers.dev 在国内会被 DNS 污染，这个域名不会，
 * 统一走中转才能保证「账号登录」在两种环境下都可用。
 * 用户也可以在页面的「连接设置」里随时覆盖。
 */
export const DEFAULT_PROXY_BASE = 'https://natb-issue.wgdocs.ddns-ip.net'

/** 仓库拥有者，恒定拥有管理员面板 */
export const OWNER_LOGINS = ['Mengmiya1027']

/** 额外管理员白名单（写作者）。留空则完全以 GitHub 的 collaborator 权限为准 */
export const EXTRA_ADMIN_LOGINS = []

/** localStorage 键名，统一前缀避免与站点其它模块冲突 */
export const STORAGE_KEYS = {
  token: 'natb:issue:token',
  user: 'natb:issue:user',
  proxy: 'natb:issue:proxy',
  theme: 'natb:issue:theme',
}
