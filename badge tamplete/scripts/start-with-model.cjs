const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { modelsDir, updateModelManifest } = require('./model-manifest.cjs')

updateModelManifest()

let updateTimer
const watcher = fs.watch(modelsDir, (_event, filename) => {
  if (!filename || !filename.toLowerCase().endsWith('.glb')) return
  clearTimeout(updateTimer)
  updateTimer = setTimeout(updateModelManifest, 150)
})

const reactScripts = path.join(path.dirname(require.resolve('react-scripts/package.json')), 'bin', 'react-scripts.js')
const server = spawn(process.execPath, [reactScripts, 'start'], { stdio: 'inherit' })

const stop = (signal) => {
  watcher.close()
  server.kill(signal)
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
server.on('exit', (code) => {
  watcher.close()
  process.exit(code ?? 0)
})
