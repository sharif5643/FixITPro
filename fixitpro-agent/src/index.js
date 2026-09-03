'use strict'

const https = require('https')
const { getCert } = require('./cert')
const { openDrawerNetwork, openDrawerWindows, openDrawerSerial, listPrinters, listComPorts } = require('./drawer')

const PORT = 7777
const VERSION = '1.1.0'

// ── Allowed origins (web app domains only) ────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://fixitpro.in.th',
  'http://localhost:3001',
  'http://localhost:3000',
  'http://127.0.0.1:3001',
]

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { resolve({}) }
    })
  })
}

function send(res, status, data, origin) {
  res.writeHead(status, corsHeaders(origin))
  res.end(JSON.stringify(data))
}

// ── HTTPS Server ──────────────────────────────────────────────────────────────

let tls
try {
  tls = getCert()
} catch (err) {
  console.error('[Cert] Failed to generate/load certificate:', err.message)
  process.exit(1)
}

const server = https.createServer({ key: tls.key, cert: tls.cert }, async (req, res) => {
  const origin = req.headers['origin'] || ''

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin))
    res.end()
    return
  }

  if (req.url === '/health' && req.method === 'GET') {
    send(res, 200, { status: 'ok', version: VERSION, agent: 'FixITPro Cash Drawer Agent' }, origin)
    return
  }

  if (req.url === '/printers' && req.method === 'GET') {
    send(res, 200, { printers: listPrinters(), comPorts: listComPorts() }, origin)
    return
  }

  if (req.url === '/open-drawer' && req.method === 'POST') {
    const body = await readBody(req)
    const { method, ip, port, printer, comPort, baudRate } = body

    try {
      let result
      if (method === 'network') {
        if (!ip) throw new Error('ip is required for network method')
        result = await openDrawerNetwork(ip, port)
      } else if (method === 'windows') {
        if (!printer) throw new Error('printer is required for windows method')
        result = await openDrawerWindows(printer)
      } else if (method === 'serial') {
        if (!comPort) throw new Error('comPort is required for serial method')
        result = await openDrawerSerial(comPort, baudRate)
      } else {
        throw new Error(`Unknown method: "${method}". Use: network | windows | serial`)
      }
      console.log(`[${new Date().toISOString()}] Drawer opened:`, result)
      send(res, 200, { success: true, ...result }, origin)
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Drawer error:`, err.message)
      send(res, 500, { success: false, error: err.message }, origin)
    }
    return
  }

  send(res, 404, { error: 'Not found' }, origin)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`FixITPro Agent v${VERSION}`)
  console.log(`Listening on https://localhost:${PORT}`)
  console.log(`Methods: network (IP:9100) | windows (USB printer name) | serial (COM port)`)
  console.log(``)
  console.log(`If this is the first run, install the certificate:`)
  console.log(`  Run install.bat as Administrator`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use — another instance may be running.`)
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})
