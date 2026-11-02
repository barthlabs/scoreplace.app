const assert = require('assert');
const W = require('./render-harness').window;

async function main() {
  const saved = {
    db: W.FirestoreDB,
    userVivo: W._userVivo,
    avatar: W._profileAvatarUrl,
    preload: W._preloadUserProfiles,
    refresh: W._softRefreshView
  };
  let writes = 0;
  let nameQueries = 0;
  W._profileAvatarUrl = (name, photo) => photo || ('initials://' + name);
  W._userProfileCache = {};
  W._profileNameByUid = {};
  W._playerPhotoCache = { ana: 'photo://wrong' };

  try {
    // O ramo de um UID precisa seguir a lápide como o ramo em lote já seguia.
    W.FirestoreDB = { db: { collection(name) {
      assert.strictEqual(name, 'usersPublic');
      return {
        doc(uid) { return { get: async () => ({
          exists: true, id: uid, data: () => uid === 'old' ? { mergedInto: 'new', displayName: 'Nome Lápide' } : { displayName: 'Ana', photoURL: 'photo://new' }
        }) }; },
        where() { nameQueries++; throw new Error('consulta por nome proibida'); },
        set() { writes++; throw new Error('escrita proibida'); }
      };
    } } };
    W._userVivo = async () => ({ uid: 'new', data: { displayName: 'Ana', photoURL: 'photo://new' } });
    await saved.preload(['old']);
    assert.strictEqual(W._userProfileCache.old.photoURL, 'photo://new');
    assert.strictEqual(W._userProfileCache.new.photoURL, 'photo://new');

    W._userProfileCache.other = { displayName: 'Ana', photoURL: 'photo://other' };
    W._userProfileCache.noPhoto = { displayName: 'Ana', photoURL: '' };
    assert(W._personAvatarHtml('old', 'Ana').includes('photo://new'));
    assert(W._personAvatarHtml('other', 'Ana').includes('photo://other'));
    assert(!W._personAvatarHtml('noPhoto', 'Ana').includes('photo://wrong'));
    assert(!W._personAvatarHtml('', 'Ana').includes('photo://wrong'));
    const podium = W._buildPodiumHtml('Ana', 'Ana', null, null, null, null,
      { uids: [['old'], ['other'], []] });
    assert(podium.includes('photo://new'));
    assert(podium.includes('photo://other'));
    assert(!podium.includes('photo://wrong'));

    // A hidratação conserva o UID; uma segunda passada não pode trocar foto por homônimo.
    const attrs = { 'data-uid-avatar': 'old', 'data-player-name': 'Ana' };
    const img = {
      src: '',
      getAttribute(k) { return attrs[k] || ''; },
      setAttribute(k, v) { attrs[k] = v; },
      removeAttribute(k) { delete attrs[k]; }
    };
    const root = { querySelectorAll(sel) { return sel === '[data-uid-avatar]' || sel === 'img[data-uid-photo]' ? [img] : []; } };
    W._preloadUserProfiles = async () => {};
    await W._hydrateUidNames(root);
    assert.strictEqual(attrs['data-uid-photo'], 'old');
    assert.strictEqual(img.src, 'photo://new');
    W._playerPhotoCache.ana = 'photo://wrong-again';
    W._refreshPersonPhotos(root);
    assert.strictEqual(img.src, 'photo://new');
    W._userProfileCache.old = { displayName: 'Ana Nova', photoURL: 'photo://updated' };
    W._refreshPersonPhotos(root);
    assert.strictEqual(img.src, 'photo://updated');

    let releaseOldRead;
    W._userProfilePending.own = new Promise(resolve => { releaseOldRead = resolve; });
    W._cacheSavedOwnProfile('own', 'Nome Novo', 'photo://own-new');
    assert.strictEqual(W._userProfileCache.own.photoURL, 'photo://own-new');
    W._userProfileCache.own = { displayName: 'Nome Antigo', photoURL: 'photo://own-old' };
    releaseOldRead();
    await W._userProfilePending.own;
    await Promise.resolve();
    assert.strictEqual(W._userProfileCache.own.photoURL, 'photo://own-new');
    assert.strictEqual(W._profileNameByUid.own, 'Nome Novo');
    delete W._userProfilePending.own;
    let releaseFirst, releaseSecond;
    W._userProfilePending.own = new Promise(resolve => { releaseFirst = resolve; });
    W._cacheSavedOwnProfile('own', 'Primeira', 'photo://first');
    W._userProfilePending.own = new Promise(resolve => { releaseSecond = resolve; });
    W._cacheSavedOwnProfile('own', 'Segunda', 'photo://second');
    releaseSecond();
    await W._userProfilePending.own;
    releaseFirst();
    await Promise.resolve();
    assert.strictEqual(W._userProfileCache.own.photoURL, 'photo://second');
    assert.strictEqual(W._profileNameByUid.own, 'Segunda');
    delete W._userProfilePending.own;

    // Preload da chave consome o mesmo resolvedor por UID, inclusive slots de dupla.
    const seen = [];
    W._preloadUserProfiles = async (uids) => { seen.push(...uids); };
    W._softRefreshView = () => {};
    const t = { participants: [{ uid: 'old' }, { p1Uid: 'other', p2Uid: 'noPhoto' }], standbyParticipants: [] };
    await W._preloadPlayerPhotos(t);
    assert.deepStrictEqual(seen.sort(), ['noPhoto', 'old', 'other']);
    assert.strictEqual(W._profileNameByUid.old, 'Ana Nova');
    assert.strictEqual(W._profileNameByUid.other, 'Ana');
    assert.strictEqual(nameQueries, 0);
    assert.strictEqual(writes, 0);
    // Uma consulta pública indisponível não apaga o último nome já exibido.
    delete W._userProfileCache.old;
    W._profileNameByUid.old = 'Nome já carregado';
    await W._preloadPlayerPhotos({ participants: [{ uid: 'old' }] });
    assert.strictEqual(W._profileNameByUid.old, 'Nome já carregado');

    // O seletor de parceiro não pode usar a foto gravada na inscrição nem a de
    // outra pessoa com o mesmo nome; texto manual não ganha foto de conta.
    W._userProfileCache.old = { displayName: 'Ana Nova', photoURL: 'photo://new' };
    W._profileNameByUid.old = 'Ana Nova';
    const oldGetElementById = W.document.getElementById;
    const dropdown = { innerHTML: '', style: {} };
    W.document.getElementById = id => id === 'partner-dropdown-demo' ? dropdown : null;
    try {
      W._partnerPickerRender('demo', '', [
        { uid: 'old', name: 'Ana Antiga', photo: 'photo://stale' },
        { uid: 'other', name: 'Ana', photo: 'photo://wrong-other' },
        { uid: '', name: 'Ana', photo: 'photo://wrong-manual' }
      ], [], []);
      assert(dropdown.innerHTML.includes('photo://new'));
      assert(dropdown.innerHTML.includes('photo://other'));
      assert(dropdown.innerHTML.includes('Ana Nova'));
      assert(!dropdown.innerHTML.includes('photo://stale'));
      assert(!dropdown.innerHTML.includes('photo://wrong-other'));
      assert(!dropdown.innerHTML.includes('photo://wrong-manual'));
    } finally {
      W.document.getElementById = oldGetElementById;
    }

    // Se o destino da lápide sumiu, conservar só o rótulo da própria lápide.
    W._preloadUserProfiles = saved.preload;
    W._userVivo = async () => null;
    delete W._userProfileCache.old;
    await W._preloadUserProfiles(['old']);
    assert.strictEqual(W._userProfileCache.old.displayName, 'Nome Lápide');
    process.stdout.write('✓ E17 UI: UID, lápide, dupla, avatar manual, segunda hidratação e atualização sem escrita\n');
  } finally {
    W.FirestoreDB = saved.db;
    W._userVivo = saved.userVivo;
    W._profileAvatarUrl = saved.avatar;
    W._preloadUserProfiles = saved.preload;
    W._softRefreshView = saved.refresh;
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
