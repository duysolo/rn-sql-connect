#!/usr/bin/env node
/**
 * Reports when a pinned upstream dependency has a newer release.
 *
 * Both Data Connect SDKs are still moving quickly, and a version bump can
 * change behaviour this package depends on (the untyped serialisation path on
 * Android, the observable ref types on Apple). Finding out from CI beats
 * finding out from a bug report.
 *
 * Exits 0 even when something is out of date: this is a notice, not a gate.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(
  readFileSync(join(root, 'packages', 'rn-sql-connect', 'package.json'), 'utf8'),
)

const fetchJson = async url => {
  const response = await fetch(url, { headers: { 'user-agent': 'rn-sql-connect-ci' } })
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`)
  }
  return response.json()
}

const fetchText = async url => {
  const response = await fetch(url, { headers: { 'user-agent': 'rn-sql-connect-ci' } })
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`)
  }
  return response.text()
}

const checks = [
  {
    name: 'data-connect-ios-sdk',
    pinned: pkg.sdkVersions.ios.dataConnect,
    latest: async () => {
      const release = await fetchJson(
        'https://api.github.com/repos/firebase/data-connect-ios-sdk/releases/latest',
      )
      return release.tag_name
    },
  },
  {
    name: 'com.google.firebase:firebase-dataconnect',
    pinned: `via BoM ${pkg.sdkVersions.android.firebaseBom}`,
    latest: async () => {
      const xml = await fetchText(
        'https://dl.google.com/dl/android/maven2/com/google/firebase/firebase-dataconnect/maven-metadata.xml',
      )
      return /<latest>([^<]+)<\/latest>/.exec(xml)?.[1] ?? 'unknown'
    },
  },
  {
    name: '@react-native-firebase/app',
    pinned: pkg.peerDependencies['@react-native-firebase/app'],
    latest: async () => {
      const meta = await fetchJson('https://registry.npmjs.org/@react-native-firebase/app')
      return meta['dist-tags'].latest
    },
  },
]

let failures = 0
for (const check of checks) {
  try {
    const latest = await check.latest()
    const marker = String(check.pinned).includes(latest) ? 'up to date' : 'newer available'
    console.log(`${check.name}: pinned ${check.pinned}, latest ${latest} (${marker})`)
  } catch (error) {
    failures += 1
    console.log(`${check.name}: check failed (${error.message})`)
  }
}

if (failures === checks.length) {
  console.log('every upstream check failed; the network is probably unavailable')
}
