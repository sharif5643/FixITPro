'use strict'

const https = require('https')
const { getCert, CERT_FILE } = require('./cert')
const { isCertInstalled, isHelperPrinterInstalled, installCertElevated, installHelperPrinterElevated, addToStartup } = require('./setup')
const { openDrawerNetwork, openDrawerWindows, openDrawerSerial, listPrinters, listComPorts } = require('./drawer')

const PORT = 7777
const VERSION = '1.1.0'

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
    // Required for Chrome Private Network Access (public HTTPS → local HTTPS)
    'Access-Control-Allow-Private-Network': 'true',
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

// ── First-run setup ───────────────────────────────────────────────────────────

function firstRunSetup() {
  console.log(`FixITPro Agent v${VERSION}`)
  console.log('─'.repeat(45))

  // 1. Generate cert (no admin needed)
  console.log('[1/4] สร้าง certificate...')
  const tls = getCert()
  console.log('      สร้างแล้ว')

  // 2. Install cert + helper printer (same UAC popup)
  console.log('[2/4] ตรวจสอบ certificate...')
  if (!isCertInstalled()) {
    console.log('      จะมี popup "Do you want to allow..." ขึ้นมา — กด Yes')
    try {
      installCertElevated(CERT_FILE)
      console.log('      ติดตั้ง certificate + cash drawer printer สำเร็จ')
    } catch (err) {
      console.error('      ติดตั้งไม่สำเร็จ:', err.message)
      console.error('      Agent จะยังรันได้ แต่ browser อาจแสดง warning')
    }
  } else {
    console.log('      ติดตั้งแล้ว (ข้าม)')
  }

  // 3. Install cash drawer helper printer (separate UAC if cert was already done)
  console.log('[3/4] ตรวจสอบ cash drawer printer...')
  if (!isHelperPrinterInstalled()) {
    console.log('      ยังไม่มี — จะมี popup ขึ้นมา กด Yes')
    try {
      installHelperPrinterElevated()
      if (isHelperPrinterInstalled()) {
        console.log('      ติดตั้งสำเร็จ')
      } else {
        console.log('      ไม่พบเครื่องพิมพ์ USB — เชื่อมต่อเครื่องพิมพ์แล้วรัน agent ใหม่')
      }
    } catch (err) {
      console.warn('      ติดตั้งไม่สำเร็จ:', err.message)
    }
  } else {
    console.log('      พร้อมแล้ว (ข้าม)')
  }

  // 4. Add to Windows Startup
  console.log('[4/4] ตั้งค่า Auto-start...')
  addToStartup()

  console.log('─'.repeat(45))
  return tls
}

// ── HTTPS Server ──────────────────────────────────────────────────────────────

const tls = firstRunSetup()

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

// Listen on all interfaces (IPv4 + IPv6) so both 127.0.0.1 and ::1 work.
// CORS headers restrict browser access to allowed origins only.
server.listen(PORT, () => {
  console.log(`พร้อมใช้งาน! https://localhost:${PORT}`)
  console.log(`เปิดหน้าต่างนี้ทิ้งไว้ (หรือ minimize ได้)`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} ถูกใช้งานอยู่ — มี Agent อื่นรันอยู่แล้ว`)
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})
