/* O botão de criar grupo copia o nome e abre o aplicativo, sem mandar a pessoa
 * para um URL de conversa vazio (erro filmado no Android em 19/out/2026). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/wa-group.js'), 'utf8');

async function run(userAgent, clipboardWorks) {
  const events = [];
  const t = { id: 'tour-test', name: 'Torneio Teste', sport: 'Beach Tennis' };
  const location = { set href(url) { events.push(['open', url]); } };
  const input = {
    value: 'Jogo 182 · Beach Tennis · Torneio Teste', readOnly: true,
    focus() {}, select() {}, setSelectionRange() {}, selectionStart: 0, selectionEnd: 0
  };
  const W = { console, location, AppStore: { tournaments: [t] },
    navigator: { userAgent, clipboard: { writeText(name) {
      events.push(['copy', name]);
      return clipboardWorks ? Promise.resolve() : Promise.reject(new Error('sem clipboard'));
    } } },
    document: { getElementById: id => id === 'wa-grp-name' ? input : null,
      execCommand: () => false },
    showNotification() {}
  };
  W.window = W;
  vm.createContext(W);
  vm.runInContext(source, W, { filename: 'wa-group.js' });
  W._waGrpCopyName(t.id, '', false);
  await Promise.resolve();
  await Promise.resolve();
  return events;
}

(async () => {
  const cases = [
    ['Android', 'Mozilla/5.0 (Linux; Android 15) Chrome/130', 'whatsapp://app'],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605', 'https://api.whatsapp.com/'],
    ['desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/130', 'https://web.whatsapp.com/']
  ];
  for (const [name, agent, expected] of cases) {
    const events = await run(agent, true);
    if (events.length !== 2 || events[0][0] !== 'copy' || events[1][0] !== 'open' || events[1][1] !== expected)
      throw new Error(name + ': cópia/abertura incorreta: ' + JSON.stringify(events));
  }
  const failedCopy = await run(cases[0][1], false);
  if (failedCopy.some(event => event[0] === 'open')) throw new Error('não abrir se a cópia falhou');
  console.log('✓ wa-group-copy-open-app: 4 cenários');
})().catch(error => { console.error(error); process.exitCode = 1; });
