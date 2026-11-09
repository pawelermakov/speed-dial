import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32, inflateRawSync } from 'node:zlib';

const repo = 'pawelermakov/speed-dial';
const repoUrl = 'https://github.com/' + repo;
const tag = 'current';
const tagRef = 'refs/tags/' + tag;
const title = 'Speed Dial';
const browsers = { chrome: 3, firefox: 2 };
const assetName = (browser) => `speed-dial-${browser}.zip`;
const validRepo =
  /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(?:pawelermakov\/speed-dial)(?:\.git)?\/?$/i;

function run(program, args, { inherit = false, allow404 = false, label = program } = {}) {
  const result = spawnSync(program, args, {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (allow404 && result.status === 1 && /\(HTTP 404\)\s*$/.test(result.stderr)) return null;
  if (result.error || result.status !== 0) {
    throw new Error(
      `${label}: ${result.error?.message ?? (result.stderr?.trim() || result.signal || `код ${result.status}`)}`,
    );
  }
  return result.stdout?.trim();
}

// WXT produces single-volume ZIPs with stored or deflated entries.
export function readZipManifest(zip) {
  const requireZip = (condition) => {
    if (!condition) throw new Error('Повреждённый или неподдерживаемый ZIP');
  };
  let end = zip.length - 22;
  while (
    end >= Math.max(0, zip.length - 22 - 65535) &&
    (zip.readUInt32LE(end) !== 0x06054b50 || end + 22 + zip.readUInt16LE(end + 20) !== zip.length)
  )
    end--;
  requireZip(end >= Math.max(0, zip.length - 22 - 65535));
  const count = zip.readUInt16LE(end + 10);
  const start = zip.readUInt32LE(end + 16);
  requireZip(
    zip.readUInt32LE(end + 4) === 0 &&
      zip.readUInt16LE(end + 8) === count &&
      start + zip.readUInt32LE(end + 12) === end,
  );

  let cursor = start;
  let manifest;
  for (let index = 0; index < count; index++) {
    requireZip(cursor + 46 <= end && zip.readUInt32LE(cursor) === 0x02014b50);
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const checksum = zip.readUInt32LE(cursor + 16);
    const size = zip.readUInt32LE(cursor + 20);
    const unpackedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const local = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
    requireZip(
      cursor <= end &&
        !(flags & 1) &&
        (method === 0 || method === 8) &&
        local + 30 <= start &&
        zip.readUInt32LE(local) === 0x04034b50 &&
        zip.readUInt16LE(local + 6) === flags &&
        zip.readUInt16LE(local + 8) === method &&
        zip.readUInt16LE(local + 26) === nameLength,
    );
    const dataStart = local + 30 + nameLength + zip.readUInt16LE(local + 28);
    requireZip(
      dataStart + size <= start && name.equals(zip.subarray(local + 30, local + 30 + nameLength)),
    );
    const compressed = zip.subarray(dataStart, dataStart + size);
    const data =
      method === 0
        ? compressed
        : inflateRawSync(compressed, {
            maxOutputLength: Math.max(1, unpackedSize),
          });
    requireZip(data.length === unpackedSize && crc32(data) === checksum);
    if (name.toString() === 'manifest.json') {
      requireZip(manifest === undefined);
      manifest = JSON.parse(data.toString('utf8'));
    }
  }
  requireZip(cursor === end);
  if (!manifest) throw new Error('В корне ZIP нет manifest.json');
  return manifest;
}

export async function release(execute = run) {
  const git = (...args) => execute('git', args, { label: `git ${args[0]}` });
  const gh = (args, options) => execute('gh', args, options);
  const api = (path, args = [], options = {}) => {
    const output = gh(['api', '--hostname', 'github.com', `repos/${repo}${path}`, ...args], {
      label: `GitHub API ${path}`,
      ...options,
    });
    return output === null ? null : JSON.parse(output);
  };
  const list = (path) => api(path, ['--paginate', '--slurp']).flat();
  const getRelease = () => {
    const releases = list('/releases?per_page=100').filter((item) => item.tag_name === tag);
    if (releases.length > 1) throw new Error('На GitHub найдено несколько релизов current');
    return releases[0];
  };
  const revision = (item) =>
    item &&
    JSON.stringify([
      item.id,
      item.name,
      item.body,
      item.draft,
      item.prerelease,
      item.immutable,
      item.target_commitish,
      item.assets.map(({ id, name, size, state, digest }) => [id, name, size, state, digest]),
    ]);
  const remoteTag = (remote) => {
    const refs = new Map(
      git('ls-remote', '--tags', remote, tagRef, tagRef + '^{}')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.trim().split('\t').reverse()),
    );
    const object = refs.get(tagRef) ?? '';
    return { object, commit: refs.get(tagRef + '^{}') ?? object };
  };
  const checkTree = () => {
    if (git('status', '--porcelain', '--untracked-files=all')) {
      throw new Error(
        'Рабочее дерево содержит изменения или новые файлы. Выпуск требует чистого HEAD.',
      );
    }
  };
  const checkRelease = (current) => {
    if (current?.immutable)
      throw new Error('Релиз current неизменяемый. Для обновления нужен изменяемый канал.');
    const extra = current?.assets.filter(
      (asset) => !Object.keys(browsers).map(assetName).includes(asset.name),
    );
    if (extra?.length) {
      throw new Error(
        `В current есть посторонние файлы: ${extra.map((asset) => asset.name).join(', ')}. Проверьте их вручную.`,
      );
    }
  };
  const checkPolicy = (oldTag, sha) => {
    if (api('/immutable-releases', [], { allow404: true })?.enabled) {
      throw new Error(
        'В GitHub включены Immutable releases. Для канала current отключите эту настройку.',
      );
    }
    if (oldTag.commit === sha) return;
    for (const ruleset of list('/rulesets?targets=tag&includes_parents=true&per_page=100')) {
      if (ruleset.enforcement !== 'active' || ruleset.target !== 'tag') continue;
      const details = api(`/rulesets/${ruleset.id}`);
      const ref = details.conditions?.ref_name;
      const matches = (pattern) => pattern === '~ALL' || posix.matchesGlob(tagRef, pattern);
      const applies = !ref || (ref.include.some(matches) && !ref.exclude.some(matches));
      const blocked = oldTag.object ? ['update', 'non_fast_forward'] : ['creation'];
      if (applies && details.rules.some(({ type }) => blocked.includes(type))) {
        throw new Error(
          `Тег current защищён правилом «${ruleset.name}». Проверьте правила тега в настройках GitHub.`,
        );
      }
    }
  };

  if (git('rev-parse', '--show-prefix'))
    throw new Error('Запустите npm run release из корня репозитория.');
  const origin = git('remote', 'get-url', '--all', 'origin');
  const pushUrl = git('remote', 'get-url', '--push', '--all', 'origin');
  if (!validRepo.test(origin) || !validRepo.test(pushUrl)) {
    throw new Error(`origin должен указывать на ${repo} для чтения и записи.`);
  }
  const sha = git('rev-parse', '--verify', 'HEAD^{commit}');
  checkTree();
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const { version } = manifest;
  const validVersion =
    typeof version === 'string' &&
    /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/.test(version) &&
    version.split('.').every((part) => Number(part) <= 65535) &&
    /[1-9]/.test(version);
  if (!validVersion || pkg.version !== version) {
    throw new Error(
      'Укажите одинаковую корректную версию расширения в package.json и manifest.json.',
    );
  }
  gh(['auth', 'status', '--hostname', 'github.com'], {
    label: 'Проверьте GitHub CLI и выполните gh auth login',
  });
  const repository = api('');
  if (
    repository.full_name.toLowerCase() !== repo ||
    !repository.permissions?.push ||
    repository.archived
  ) {
    throw new Error(`Для выпуска нужны права записи в ${repo}.`);
  }
  const upstream = git(
    'for-each-ref',
    '--points-at=HEAD',
    '--format=%(refname)%09%(upstream:remotename)%09%(upstream:remoteref)',
    'refs/heads',
  );
  const branch = git('rev-parse', '--symbolic-full-name', 'HEAD');
  const [, remote, upstreamRef] =
    upstream
      .split('\n')
      .map((line) => line.split('\t'))
      .find(([ref]) => ref === branch) ?? [];
  const branchRef =
    remote === 'origin' && upstreamRef?.startsWith('refs/heads/')
      ? upstreamRef
      : branch.startsWith('refs/heads/')
        ? branch
        : `refs/heads/${repository.default_branch}`;
  const checkPublished = () => {
    const [tip] = git('ls-remote', '--heads', origin, branchRef).split('\t');
    if (tip === sha) return;
    if (!tip || !['ahead', 'identical'].includes(api(`/compare/${sha}...${tip}`).status)) {
      throw new Error(`HEAD ${sha} ещё не опубликован в ${branchRef}. Отправьте коммит вручную.`);
    }
  };
  checkPublished();
  const current = getRelease();
  const oldTag = remoteTag(pushUrl);
  checkRelease(current);
  checkPolicy(oldTag, sha);
  const pushTag = (...options) =>
    git(
      'push',
      ...options,
      '--no-follow-tags',
      `--force-with-lease=${tagRef}:${oldTag.object}`,
      pushUrl,
      `${sha}:${tagRef}`,
    );
  if (oldTag.commit !== sha) pushTag('--dry-run');
  if (!process.env.npm_execpath) throw new Error('Запустите скрипт через npm run release.');

  await mkdir('.output', { recursive: true });
  const temp = await mkdtemp(join('.output', 'release-'));
  const finished = [];
  let stage;
  try {
    const config = join(temp, 'release.config.mjs');
    await writeFile(
      config,
      [
        "import config from '../../wxt.config.ts';",
        `export default { ...config, outDir: ${JSON.stringify(temp)}, zip: { ...config.zip, zipSources: false } };`,
      ].join('\n'),
    );
    const npm = (...args) =>
      execute(process.execPath, [process.env.npm_execpath, 'run', ...args], {
        inherit: true,
        label: `npm run ${args[0]}`,
      });
    npm('check');
    npm('zip', '--', '--mode', 'production', '--config', config);
    npm('zip:firefox', '--', '--mode', 'production', '--config', config);
    const assets = [];
    for (const [browser, mv] of Object.entries(browsers)) {
      const source = join(temp, `${pkg.name}-${version}-${browser}.zip`);
      const name = assetName(browser);
      const path = join(temp, name);
      let bytes;
      try {
        bytes = await readFile(source);
        const built = readZipManifest(bytes);
        const validId =
          browser === 'chrome'
            ? Boolean(manifest.key) && built.key === manifest.key
            : built.browser_specific_settings?.gecko?.id === 'speed-dial-x@pawelermakov.github.io';
        if (built.version !== version || built.manifest_version !== mv || !validId) {
          throw new Error('Версия, тип манифеста или идентификатор расширения не совпадает');
        }
      } catch (error) {
        throw new Error(`${source}: ${error.message}`, { cause: error });
      }
      await copyFile(source, path);
      assets.push({
        name,
        path,
        size: bytes.length,
        digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      });
    }

    checkTree();
    if (git('rev-parse', '--verify', 'HEAD^{commit}') !== sha)
      throw new Error('HEAD изменился во время сборки.');
    checkPublished();
    const refreshed = getRelease();
    if (revision(refreshed) !== revision(current) || remoteTag(pushUrl).object !== oldTag.object) {
      throw new Error('Релиз или тег current изменился во время сборки. Повторите выпуск.');
    }
    checkPolicy(oldTag, sha);
    const date = new Date().toISOString();
    const notes = `Версия: ${version}\n\nПубликация (UTC): ${date}\n\nКоммит: \`${sha}\`\n\n[Установка и обновление](${repoUrl}/blob/${sha}/README.md#релизы)`;
    const releaseCommand = (action, ...args) =>
      gh(['release', action, tag, '--repo', 'github.com/' + repo, ...args], {
        label: `gh release ${action}`,
      });
    const publishStep = (description, action) => {
      stage = description;
      const result = action();
      finished.push(description);
      return result;
    };
    let id = current?.id;
    if (!current) {
      id = publishStep('создание черновика', () => {
        const draft = api('/releases', [
          '--method',
          'POST',
          '-f',
          `tag_name=${tag}`,
          '-f',
          `target_commitish=${sha}`,
          '-f',
          `name=${title}`,
          '-f',
          `body=${notes}`,
          '-F',
          'draft=true',
        ]);
        if (!draft.draft || draft.tag_name !== tag || !Number.isSafeInteger(draft.id))
          throw new Error('GitHub не вернул ID черновика current.');
        return draft.id;
      });
    }
    const verifyAssets = (item) => {
      if (
        item.id !== id ||
        item.tag_name !== tag ||
        item.assets.length !== assets.length ||
        assets.some(
          (expected) =>
            !item.assets.some(
              (actual) =>
                actual.name === expected.name &&
                actual.state === 'uploaded' &&
                actual.size === expected.size &&
                (!actual.digest || actual.digest === expected.digest),
            ),
        )
      )
        throw new Error('GitHub не подтвердил оба ZIP с ожидаемыми именами, размерами и хешами.');
    };
    for (const asset of assets) {
      publishStep(`загрузка ${asset.name}`, () =>
        releaseCommand('upload', asset.path, '--clobber'),
      );
    }
    publishStep('проверка загруженных ZIP', () => verifyAssets(api(`/releases/${id}`)));
    publishStep('сверка тега current с HEAD', () => {
      if (oldTag.commit !== sha) {
        pushTag();
      }
      if (remoteTag(pushUrl).commit !== sha)
        throw new Error('Удалённый тег current не совпадает с HEAD.');
    });
    publishStep('публикация метаданных и Latest', () =>
      api(`/releases/${id}`, [
        '--method',
        'PATCH',
        '-f',
        `name=${title}`,
        '-f',
        `body=${notes}`,
        '-F',
        'draft=false',
        '-F',
        'prerelease=false',
        '-f',
        'make_latest=true',
      ]),
    );
    publishStep('итоговая сверка', () => {
      const latest = api('/releases/latest');
      verifyAssets(latest);
      if (
        latest.draft ||
        latest.prerelease ||
        latest.immutable ||
        latest.name !== title ||
        latest.body !== notes ||
        remoteTag(pushUrl).commit !== sha
      ) {
        throw new Error('GitHub не подтвердил состояние Latest, метаданные или тег current.');
      }
    });
    console.log(`${title} ${version}\n${sha}\n${date}\n${repoUrl}/releases/tag/${tag}`);
    for (const asset of assets) console.log(`${repoUrl}/releases/download/${tag}/${asset.name}`);
  } catch (error) {
    if (stage) {
      throw new Error(
        `${error.message}\nЭтап: ${stage}. Подтверждены: ${finished.join(', ') || 'нет'}. GitHub мог сохранить часть изменений. Устраните причину и повторите npm run release.`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await release();
  } catch (error) {
    console.error(`Выпуск прерван: ${error.message}`);
    process.exitCode = 1;
  }
}
