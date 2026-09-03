'use strict'

const forge = require('node-forge')
const fs = require('fs')
const path = require('path')
const os = require('os')

const CERT_DIR = path.join(os.homedir(), 'AppData', 'Roaming', 'FixITPro-Agent')
const CERT_FILE = path.join(CERT_DIR, 'localhost.crt')
const KEY_FILE  = path.join(CERT_DIR, 'localhost.key')

function ensureCertDir() {
  fs.mkdirSync(CERT_DIR, { recursive: true })
}

function certExists() {
  return fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)
}

function generateCert() {
  console.log('[Cert] Generating self-signed certificate for localhost...')
  ensureCertDir()

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = Date.now().toString(16)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter  = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10)

  const attrs = [
    { name: 'commonName',       value: 'localhost' },
    { name: 'organizationName', value: 'FixITPro Agent' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
      ],
    },
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())

  const certPem = forge.pki.certificateToPem(cert)
  const keyPem  = forge.pki.privateKeyToPem(keys.privateKey)

  fs.writeFileSync(CERT_FILE, certPem, { mode: 0o600 })
  fs.writeFileSync(KEY_FILE,  keyPem,  { mode: 0o600 })

  console.log('[Cert] Saved to', CERT_DIR)
  return { cert: certPem, key: keyPem }
}

function loadCert() {
  return {
    cert: fs.readFileSync(CERT_FILE, 'utf8'),
    key:  fs.readFileSync(KEY_FILE,  'utf8'),
  }
}

function getCert() {
  if (!certExists()) generateCert()
  return loadCert()
}

module.exports = { getCert, CERT_FILE, CERT_DIR }
