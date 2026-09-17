const fs = require('fs')
const path = require('path')

const projectDir = path.resolve(__dirname, '..')
const modelsDir = path.join(projectDir, 'public', 'models')
const manifestPath = path.join(modelsDir, 'current-model.json')

function updateModelManifest() {
  const models = fs.readdirSync(modelsDir)
    .filter((name) => name.toLowerCase().endsWith('.glb'))
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(modelsDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  if (!models.length) throw new Error(`No .glb files found in ${modelsDir}`)

  const latest = models[0]
  const manifest = `${JSON.stringify({
    url: `/models/${encodeURIComponent(latest.name)}?v=${Math.round(latest.mtimeMs)}`,
    file: latest.name
  }, null, 2)}\n`

  const previous = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : ''
  if (previous !== manifest) {
    fs.writeFileSync(manifestPath, manifest)
    console.log(`[model] Using ${latest.name}`)
  }
}

if (require.main === module) updateModelManifest()

module.exports = { modelsDir, updateModelManifest }
