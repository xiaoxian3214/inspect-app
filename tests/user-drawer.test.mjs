import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/** 用户抽屉由页面编排事件，视觉结构在原生组件中复用。 */
test('list delegates the H5 user drawer to a native component', async () => {
  const page = await readFile('pages/report/list.uvue', 'utf8')
  assert.match(page, /<UserInfoDrawer[\s\S]*?:locale="currentLanguage"[\s\S]*?@change-language="setLanguage"[\s\S]*?@invite-vendor="handleInviteVendor"[\s\S]*?@view-local-data="handleViewLocalData"[\s\S]*?@clear-cache="handleClearLocalCache"[\s\S]*?@logout="handleLogout"/)
  assert.doesNotMatch(page, /class="drawer-overlay"/)
  assert.match(page, /setAppSetting\('qcm_language', normalizedLanguage\)/)
  assert.match(page, /applyLocale\(normalizedLanguage\)/)
})

/** 用户抽屉使用原生弹层的遮罩事件关闭，内容区点击不得误触关闭。 */
test('user drawer routes page-container overlay clicks to the parent close handler', async () => {
  const source = await readFile('components/inspection/UserInfoDrawer.uvue', 'utf8')
  const page = await readFile('pages/report/list.uvue', 'utf8')
  assert.match(source, /<page-container\s+:show="visible"\s+position="left"\s+:overlay="true"[\s\S]*?@clickoverlay="closeDrawer"/)
  assert.match(source, /<view class="user-drawer">/)
  assert.doesNotMatch(source, /class="user-drawer-overlay"|@click\.stop/)
  assert.match(source, /function closeDrawer\(\).*emit\('close'\)/)
  assert.match(page, /<UserInfoDrawer[\s\S]*?@close="closeUserDrawer"/)
  assert.match(page, /function closeUserDrawer\(\): void \{\s*showUserDrawer\.value = false/)
})

/** 对齐 H5 左侧抽屉的头部、信息区和底部语言及业务操作。 */
test('native user drawer matches the H5 three-section layout and locale codes', async () => {
  const source = await readFile('components/inspection/UserInfoDrawer.uvue', 'utf8')
  const template = source.split('</template>')[0]
  const style = source.split('<style>')[1] ?? ''
  assert.match(template, /class="user-drawer-header"[\s\S]*?class="user-info-list"[\s\S]*?class="user-drawer-footer"/)
  for (const label of ['用户信息', '用户名称', '用户ID', '邮箱', '切换语言', '邀请供应商', '查看本地数据', '清除本地缓存', '退出登录']) assert.ok(template.includes(`t('${label}')`), label)
  assert.match(template, /v-for="code in localeCodes"[\s\S]*?class="user-lang-option"[\s\S]*?:class="\{ active: code === locale \}"[\s\S]*?\{\{ code \}\}/)
  assert.match(source, /const localeCodes = computed\(\(\): string\[\] => \(props\.locales as string\[\]\)\.map/)
  assert.match(template, /@click="changeLanguage\(code\)"/)
  assert.match(template, /:custom-style="drawerContainerStyle"/)
  assert.match(source, /Math\.min\(uni\.getWindowInfo\(\)\.windowWidth \* 0\.82, uni\.rpx2px\(640\)\)/)
  assert.match(style, /\.user-drawer\s*\{[^}]*width:\s*100%;[^}]*flex-direction:\s*column;/s)
  assert.match(style, /\.user-drawer-footer\s*\{[^}]*margin-top:\s*auto;/s)
  assert.match(source, /safeBottomPaddingPx\(28\)/)
  assert.match(template, /<TopSafeArea background-color="#ffffff"\s*\/>/)
  assert.doesNotMatch(source, /window\.|document\.|<svg|localStorage|env\(/)
})

/** 操作事件具有明确业务语义，禁用状态不可重复触发。 */
test('native user drawer emits business actions and respects busy buttons', async () => {
  const source = await readFile('components/inspection/UserInfoDrawer.uvue', 'utf8')
  assert.match(source, /emit\('change-language', code\)/)
  assert.match(source, /emit\('invite-vendor'\)/)
  assert.match(source, /emit\('view-local-data'\)/)
  assert.match(source, /emit\('clear-cache'\)/)
  assert.match(source, /emit\('logout'\)/)
  assert.match(source, /if \(props\.inviteGenerating\) return/)
  assert.match(source, /if \(props\.clearingLocalCache\) return/)
})

/** 检查更新入口位于退出登录前，交由列表页发起真实更新检查。 */
test('update action precedes logout and delegates to the list page', async () => {
  const drawer = await readFile('components/inspection/UserInfoDrawer.uvue', 'utf8')
  const page = await readFile('pages/report/list.uvue', 'utf8')
  const translations = await readFile('i18n/translate.uts', 'utf8')
  const template = drawer.split('</template>')[0]
  assert.match(template, /@click="checkForUpdates"[^>]*>.*t\('检查更新'\)[\s\S]*?t\('退出登录'\)/)
  assert.match(drawer, /emit\('check-for-updates'\)/)
  assert.match(page, /@check-for-updates="handleCheckForUpdates"/)
  assert.match(page, /async function handleCheckForUpdates\(\): Promise<void>/)
  assert.match(page, /appUpdateService\.check\(/)
  assert.equal(translations.match(/\["检查更新",/g)?.length, 2)
})
