import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'

/**
 * Files placed in public/downloads after the site was built (the Android APKs and apps.json,
 * published by .github/workflows/android-apps.yml into the downloads volume). Next.js only
 * serves public files that existed at build time; files baked into the image are still served
 * as static files before this route is reached.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DIR = join(process.cwd(), 'public', 'downloads')
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const TYPES: Record<string, string> = {
  apk:  'application/vnd.android.package-archive',
  json: 'application/json; charset=utf-8',
  exe:  'application/octet-stream',
  bat:  'application/octet-stream',
}

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const name = params.file
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (!NAME.test(name) || name.includes('..') || !TYPES[ext]) {
    return new Response('Not found', { status: 404 })
  }
  const path = join(DIR, name)
  let size: number
  try {
    const s = await stat(path)
    if (!s.isFile()) throw new Error('not a file')
    size = s.size
  } catch {
    return new Response('Not found', { status: 404 })
  }
  const headers: Record<string, string> = {
    'Content-Type': TYPES[ext],
    'Content-Length': String(size),
    // apps.json changes with every publish; the APK URLs carry ?v=<versionCode>
    'Cache-Control': ext === 'json' ? 'no-store' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  }
  if (ext !== 'json') headers['Content-Disposition'] = `attachment; filename="${name}"`
  const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream
  return new Response(body, { headers })
}
