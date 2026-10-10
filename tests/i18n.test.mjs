import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

test('Chinese, English and Vietnamese translate inspection copy', async () => {
  const { translate, normalizeLocale } = await loadUtsModule('i18n/translate.uts')
  assert.equal(translate('验货系统', 'zh'), '验货系统')
  assert.equal(translate('验货系统', 'en'), 'Inspection System')
  assert.equal(translate('验货系统', 'vi'), 'Hệ thống kiểm hàng')
  assert.equal(normalizeLocale('en-US'), 'en')
  assert.equal(normalizeLocale('vi-VN'), 'vi')
  assert.equal(normalizeLocale('fr-FR'), 'zh')
  assert.equal(translate('未收录文案', 'en'), '未收录文案')
  assert.equal(translate('已选 {count} 条', 'en', { count: 3 }), 'Selected 3 items')
  assert.equal(translate('仍有 2 张图片未上传完成，请联网后重试', 'en'), '2 photos are not uploaded. Connect and try again.')
  assert.equal(translate('仍有 1 个必填检查项未完成', 'vi'), 'Còn 1 mục kiểm tra bắt buộc chưa hoàn thành')
})

test('login and task list share reactive locale and keep API language synchronized', async () => {
  const login = await readFile('pages/login/login.uvue', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const locale = await readFile('i18n/index.uts', 'utf8')
  assert.match(login, /t\('验货系统'\)/)
  assert.match(login, /setLanguage|changeLanguage/)
  assert.match(list, /t\('验货'\)/)
  assert.match(list, /setAppSetting\('qcm_language', normalizedLanguage\)/)
  assert.match(list, /applyLocale\(normalizedLanguage\)/)
  assert.match(locale, /ref\('zh'\)/)
})

test('production pages and reusable components translate their static labels', async () => {
  const { translate } = await loadUtsModule('i18n/translate.uts')
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'debug') continue
      const file = `${directory}/${entry.name}`
      if (entry.isDirectory()) { await inspect(file); continue }
      if (!file.endsWith('.uvue')) continue
      const source = await readFile(file, 'utf8')
      const template = source.split('</template>')[0]
      if (template.includes('t(')) {
        const script = source.split('<script setup lang="uts">')[1]?.split('</script>')[0] ?? ''
        assert.match(script, /import \{[^}]*\bt\b[^}]*\} from ['"][^'"]*i18n\/index\.uts['"]/, `${file}: translation helper must be imported in the script`)
      }
      const script = source.split('<script setup lang="uts">')[1]?.split('</script>')[0] ?? ''
      assert.doesNotMatch(script, /(?:title|content):\s*'[^']*[\p{Script=Han}][^']*'/u, `${file}: modal and toast copy must be translated`)
      assert.doesNotMatch(script, /\?\.message\s*\?\?\s*'[^']*[\p{Script=Han}][^']*'/u, `${file}: error fallback must be translated`)
      for (const match of template.matchAll(/>([^<>{}"=]*[\p{Script=Han}][^<>{}"=]*)<\/\w+>/gu)) {
        assert.fail(`${file}: untranslated text: ${match[1].trim()}`)
      }
      for (const match of template.matchAll(/(?<!:)placeholder="([^"{]*[\p{Script=Han}][^"}]*)"/gu)) {
        assert.fail(`${file}: untranslated placeholder: ${match[1]}`)
      }
      for (const match of source.matchAll(/\bt\('([^']*[\p{Script=Han}][^']*)'/gu)) {
        assert.notEqual(translate(match[1], 'en'), match[1], `${file}: missing English: ${match[1]}`)
        assert.notEqual(translate(match[1], 'vi'), match[1], `${file}: missing Vietnamese: ${match[1]}`)
      }
    }
  }
  await inspect('pages')
  await inspect('components')
})
