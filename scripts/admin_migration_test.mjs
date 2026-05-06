import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file) => fs.existsSync(path.join(root, file))

assert.equal(exists('src/admin/layout/AdminLayout.vue'), true, 'admin layout shell is missing')

const main = read('src/main.js')
assert.match(main, /element-plus\/dist\/index\.css/, 'Element Plus CSS must be loaded globally')
assert.doesNotMatch(main, /app\.use\(ElementPlus\)/, 'Element Plus must not be registered as a full bundle')
assert.match(main, /adminElementComponents/, 'Element Plus admin components should be registered explicitly')
assert.match(main, /app\.use\(component\)/, 'Element Plus admin components must be registered')

const adminViews = [
  'src/admin/views/AdminPanel.vue',
  'src/admin/views/UserManagement.vue',
  'src/admin/views/GameManagement.vue',
  'src/admin/views/RedeemCodeManagement.vue'
]

for (const file of adminViews) {
  const source = read(file)
  assert.match(source, /AdminLayout/, `${file} must use the shared admin layout`)
}

for (const file of [
  'src/components/AdminPanel.vue',
  'src/components/UserManagement.vue',
  'src/components/GameManagement.vue',
  'src/components/RedeemCodeManagement.vue'
]) {
  assert.equal(exists(file), false, `${file} should be moved under src/admin/views`)
}

const router = read('src/router/index.js')
for (const file of adminViews) {
  assert.match(router, new RegExp(file.replace('src/', '../').replaceAll('/', '\\/')), `router must import ${file}`)
}

const redeem = read('src/admin/views/RedeemCodeManagement.vue')
assert.match(redeem, /redeem-table-shell/, 'redeem code page needs a bounded table shell')
assert.match(redeem, /overflow:\s*hidden/, 'redeem code page must prevent list growth from stretching the shell')
assert.match(redeem, /height=["']100%["']/, 'redeem code table should fill and scroll inside its shell')

console.log('admin migration checks passed')
