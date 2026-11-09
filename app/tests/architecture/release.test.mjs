import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';
import { readZipManifest, release } from '../../../scripts/release.mjs';

function zip(manifest, filename = 'manifest.json') {
  const name = Buffer.from(filename);
  const data = Buffer.from(JSON.stringify(manifest));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(name.length, 26);
  const directory = Buffer.alloc(46);
  directory.writeUInt32LE(0x02014b50);
  directory.writeUInt32LE(crc32(data), 16);
  directory.writeUInt32LE(data.length, 20);
  directory.writeUInt32LE(data.length, 24);
  directory.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, directory, name, end]);
}

test('validates the root manifest and rejects corrupted ZIP contents', () => {
  const manifest = { version: '3.1.4' };
  const archive = zip(manifest);
  assert.deepEqual(readZipManifest(archive), manifest);
  assert.throws(() => readZipManifest(zip(manifest, 'folder/manifest.json')), /manifest.json/);
  archive[43] ^= 1;
  assert.throws(() => readZipManifest(archive), /ZIP/);
});

test('release creates and updates one object, stopping before tag updates on upload failure', async (t) => {
  let sha = 'a'.repeat(40);
  let remoteTag = '';
  let current;
  let fail;
  let uploadCount = 0;
  let builds = 0;
  let creates = 0;
  let pushes = 0;
  const source = JSON.parse(readFileSync('manifest.json', 'utf8'));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const execute = (program, args) => {
    if (program === process.execPath) {
      builds++;
      const script = args[2];
      if (script === fail) throw new Error('Build failed');
      if (script !== 'check') {
        const chrome = script === 'zip';
        const built = chrome
          ? { manifest_version: 3, key: source.key }
          : {
              manifest_version: 2,
              browser_specific_settings: { gecko: { id: 'speed-dial-x@pawelermakov.github.io' } },
            };
        const browser = chrome ? 'chrome' : 'firefox';
        writeFileSync(
          join(dirname(args.at(-1)), `${pkg.name}-${source.version}-${browser}.zip`),
          zip({
            ...built,
            version: source.version,
          }),
        );
      }
      return;
    }
    if (program === 'git') {
      switch (args[0]) {
        case 'rev-parse':
          if (args[1] === '--show-prefix') return '';
          if (args[1] === '--symbolic-full-name') return 'refs/heads/main';
          return sha;
        case 'remote':
          return 'git@github.com:pawelermakov/speed-dial.git';
        case 'status':
          return fail === 'dirty' ? '?? untracked' : '';
        case 'for-each-ref':
          return 'refs/heads/main\torigin\trefs/heads/main';
        case 'ls-remote':
          if (args[1] === '--heads') return sha + '\trefs/heads/main';
          return remoteTag ? remoteTag + '\trefs/tags/current' : '';
        case 'push':
          if (args.includes('--dry-run')) return;
          assert.ok(args.includes(`--force-with-lease=refs/tags/current:${remoteTag}`));
          assert.equal(args.at(-1), sha + ':refs/tags/current');
          pushes++;
          remoteTag = sha;
          return;
      }
    }
    assert.equal(program, 'gh');
    if (args[0] === 'auth') return '';
    if (args[0] === 'release') {
      assert.equal(args[1], 'upload');
      const path = args.at(-2);
      const name = path.split(/[/\\]/).at(-1);
      uploadCount++;
      if (fail === 'upload' && name.endsWith('firefox.zip')) throw new Error('Upload failed');
      current.assets = current.assets.filter((item) => item.name !== name);
      current.assets.push({ name, state: 'uploaded', size: readFileSync(path).length });
      return;
    }
    assert.equal(args[0], 'api');
    const endpoint = args[3].slice('repos/pawelermakov/speed-dial'.length);
    if (!endpoint)
      return JSON.stringify({ full_name: 'pawelermakov/speed-dial', permissions: { push: true } });
    if (endpoint === '/immutable-releases') return fail === 'immutable' ? '{"enabled":true}' : null;
    if (endpoint.startsWith('/rulesets?')) return '[[]]';
    if (endpoint.startsWith('/releases?')) return JSON.stringify([current ? [current] : []]);
    if (endpoint === '/releases') {
      creates++;
      assert.ok(args.includes('POST'));
      assert.ok(args.includes('tag_name=current'));
      assert.ok(args.includes('draft=true'));
      assert.ok(args.includes(`target_commitish=${sha}`));
      current = { id: 9, tag_name: 'current', target_commitish: 'main', draft: true, assets: [] };
      return JSON.stringify(current);
    }
    if (args.includes('PATCH')) {
      current.name = args.find((arg) => arg.startsWith('name=')).slice(5);
      current.body = args.find((arg) => arg.startsWith('body=')).slice(5);
      current.draft = false;
      assert.ok(args.includes('make_latest=true'));
    }
    assert.ok(['/releases/9', '/releases/latest'].includes(endpoint));
    return JSON.stringify(current);
  };

  t.mock.method(console, 'log', () => {});
  const npm = process.env.npm_execpath;
  process.env.npm_execpath = npm ?? 'npm-cli.js';
  t.after(() => {
    if (npm === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = npm;
  });
  for (fail of ['dirty', 'immutable', 'zip:firefox']) {
    await assert.rejects(release(execute));
    assert.equal(creates + pushes + uploadCount, 0);
  }
  assert.equal(builds, 3);
  fail = 'upload';
  await assert.rejects(release(execute), /загрузка speed-dial-firefox.zip.*подтверждены/is);
  assert.equal(pushes, 0);
  assert.equal(current.draft, true);
  fail = undefined;
  await release(execute);
  assert.equal(pushes, 1);
  assert.equal(current.draft, false);
  sha = 'b'.repeat(40);
  await release(execute);
  assert.equal(remoteTag, sha);
  await release(execute);
  assert.equal(creates, 1);
  assert.equal(pushes, 2);
  assert.equal(current.assets.length, 2);
});
