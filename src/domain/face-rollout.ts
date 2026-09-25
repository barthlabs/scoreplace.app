/*
 * Contrato puro da CAMPANHA DO ROSTO: o que o app faz com cada pessoa, em cada dia.
 *
 * Ordem do dono (25/set/2026): _"pode ir avisando as pessoas para fazerem o cadastro da biometria
 * e dar dias para as pessoas fazerem, indicando as vantagens. para os novos já pede já sem lambuja.
 * para quem já tem conta vai pedindo e damos 1 mês para todos cadastrarem. depois disso endurece."_
 *
 * ⛔⛔ DUAS DECISÕES DE ARQUITETURA, DECLARADAS:
 *
 * ① O PRAZO É UMA DATA ÚNICA PARA TODOS, não um mês contado por pessoa. Um mês por pessoa faria a
 *    base NUNCA fechar: quem passa três meses sem entrar ganharia prazo novo ao voltar, e sempre
 *    haveria alguém no prazo. Data única também é o que se comunica ("até tal dia").
 *
 * ② "ENDURECER" NÃO É TRANCAR O APP. Depois da data, quem não cadastrou é barrado de ENTRAR EM
 *    TORNEIO — não de abrir o programa, ver os próprios resultados ou falar com o organizador.
 *    Trancar o app cria o caso de a pessoa ficar fora da própria conta no domingo do torneio, com
 *    sol e boné, sem ninguém a quem recorrer. O bloqueio mora onde a identidade importa: a
 *    inscrição, que é onde a mesma pessoa entraria duas vezes.
 *
 * ⛔ CONTA NOVA É EXIGÊNCIA IMEDIATA, e isso não depende de data: nasce com rosto. É a ordem
 * textual do dono ("já pede já sem lambuja") e é o que impede a base de duplicatas crescer
 * enquanto a campanha corre.
 *
 * ⛔⛔ NÃO EXISTE RECUSA — ordem do dono: _"e tem que cadastrar ou não entra. item de segurança"_.
 * ⭐ CORREÇÃO DE UM ERRO MEU, registrada aqui porque mudou o desenho: eu havia escrito que sem
 * caminho de recusa o consentimento não seria livre e a base seria ilegal. Isso vale quando a base
 * legal é CONSENTIMENTO. A LGPD trata biometria como dado sensível e NOMEIA esta hipótese entre as
 * que dispensam consentimento: prevenção à fraude e segurança do titular nos processos de
 * identificação e autenticação de cadastro em sistemas eletrônicos (art. 11, II, "g"). Como item
 * de SEGURANÇA — que é o que o dono disse — exigir é legítimo sem opção de recusa.
 * ⚠️ O que continua obrigatório: informar com clareza, minimizar (guarda-se o VETOR, não a foto),
 * proteger (o cofre fechado a todos) e apagar junto com a conta. Não opcionalidade.
 *
 * ⛔ MAS O ATENDIMENTO HUMANO NÃO SAI, e não é jurídico: é operacional. Quem não TEM câmera, está
 * com aparelho emprestado ou não dá conta do gesto precisa de caminho — portaria tem porteiro por
 * isso. Sem ele, gente real fica trancada fora e a conta chega no dono no domingo do torneio.
 */
namespace ScoreplaceFaceRollout {
  export type Estado = 'novo' | 'pedir' | 'insistir' | 'endurecido' | 'pronto' | 'emAnalise';

  export interface Pessoa {
    /** quando a conta nasceu (ISO). Conta nascida DEPOIS do início da campanha é "nova". */
    criadoEm?: string | null;
    /** já cadastrou o rosto? */
    temRosto?: boolean;
    /** ⛔ NÃO É RECUSA — é quem NÃO CONSEGUE cadastrar, e está esperando atendimento humano.
     * Sem câmera, aparelho emprestado, pessoa idosa. Portaria tem porteiro exatamente para isto.
     * Marcado por quem atende, nunca pela própria pessoa: senão viraria a porta de fuga que o
     * dono fechou ao dizer "cadastra ou não entra — item de segurança". */
    analiseManual?: boolean;
  }

  export interface Campanha {
    /** início do aviso (ISO) */
    comecaEm: string;
    /** fim do prazo (ISO). A partir daqui endurece. */
    terminaEm: string;
  }

  const t = (v: unknown): number => {
    const n = Date.parse(String(v || ''));
    return Number.isFinite(n) ? n : 0;
  };

  /** Dias inteiros que faltam até o fim do prazo. Nunca negativo. */
  export function diasRestantes(campanha: Campanha, agoraMs: number): number {
    const fim = t(campanha && campanha.terminaEm);
    if (!fim || !agoraMs) return 0;
    const ms = fim - agoraMs;
    return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
  }

  /**
   * O que o app faz com esta pessoa hoje.
   *  · `pronto`      — já cadastrou; nada a pedir;
   *  · `dispensado`  — recusou e segue pelo caminho alternativo. ⛔ Recusar é DIREITO: sem
   *                    alternativa o consentimento não seria livre, e a base de rostos seria
   *                    ilegal. Quem recusa continua usando o app;
   *  · `novo`        — conta nascida depois do início da campanha: exigência imediata;
   *  · `pedir`       — conta antiga, prazo correndo, e ainda sobra tempo;
   *  · `insistir`    — conta antiga, prazo correndo, reta final (7 dias ou menos);
   *  · `endurecido`  — conta antiga, prazo vencido.
   */
  export function estadoDaPessoa(pessoa: Pessoa, campanha: Campanha, agoraMs: number): Estado {
    const p = pessoa || {};
    if (p.temRosto === true) return 'pronto';
    if (p.analiseManual === true) return 'emAnalise';

    const inicio = t(campanha && campanha.comecaEm);
    const nascida = t(p.criadoEm);
    /* ⚠️ Conta SEM data de nascimento conta como ANTIGA, e é de propósito: medido em 25/set/2026,
     * há contas em produção sem `createdAt`. Tratá-las como novas exigiria rosto na hora de quem
     * já usa o app há meses — endurecer por falta de um campo nosso, não por escolha da pessoa. */
    if (inicio && nascida && nascida >= inicio) return 'novo';

    const faltam = diasRestantes(campanha, agoraMs);
    if (faltam <= 0) return 'endurecido';
    return faltam <= 7 ? 'insistir' : 'pedir';
  }

  /** Pode ENTRAR EM TORNEIO? É o único lugar onde a campanha barra. */
  export function podeSeInscrever(pessoa: Pessoa, campanha: Campanha, agoraMs: number): boolean {
    const e = estadoDaPessoa(pessoa, campanha, agoraMs);
    /* ⛔ `emAnalise` PASSA enquanto o atendimento corre: a pessoa não escolheu não cadastrar, ela
     * não conseguiu. Barrá-la seria punir por não ter câmera. Quem abusar disso aparece no
     * relatório, porque a marca é posta por quem atende e fica registrada. */
    if (e === 'pronto' || e === 'emAnalise' || e === 'pedir' || e === 'insistir') return true;
    return false;   // 'novo' sem rosto e 'endurecido' não entram em torneio
  }

  /** Pode USAR o app (abrir, ver resultados, falar com o organizador)? SEMPRE. */
  export function podeUsarOApp(): boolean {
    /* ⛔ Constante de propósito, e existe para ser lida: nenhuma etapa da campanha tranca o app.
     * Se algum dia alguém quiser trancar, vai ter que mudar esta função e explicar por quê. */
    return true;
  }
}

declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceFaceRollout;
