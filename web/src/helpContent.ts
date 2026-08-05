// Central help content — rendered by the Help page AND by the per-screen
// HelpTip modal (single source of truth).

export type HelpItem = string | { b: string; t: string };
export interface Topic {
  id: string;
  icon: string;
  title: string;
  intro?: string;
  items: HelpItem[];
}

export const TOPICS: Topic[] = [
  {
    id: 'plan-overview',
    icon: '🎯',
    title: 'Como a plataforma funciona',
    intro:
      'O Mynah segue um plano de 90 dias baseado em duas forças: receber muito input compreensível (ouvir e ler coisas que você quase entende) e praticar output com frequência (falar e escrever). Gramática entra como refinamento, não como ponto de partida.',
    items: [
      { b: '1 hora por dia, em 4 blocos:', t: 'Ouvir → Vocabulário → Fala → Escrita. Eles se reforçam: o que você ouve de manhã vira card e assunto de conversa depois.' },
      { b: 'Constância vence intensidade:', t: '1h todo dia rende mais que 7h de uma vez. O app registra seu streak 🔥 pra te manter no ritmo.' },
      { b: '3 fases de 30 dias:', t: 'reativar o inglês (1–30), fluência no trabalho (31–60) e polimento (61–90).' },
      { b: 'Marcos:', t: 'checkpoints de comportamento nos dias 7, 30, 45, 60 e 90.' },
      { b: 'Cada perfil é independente:', t: 'você e quem estudar junto têm progresso, cards e conteúdo separados.' },
    ],
  },
  {
    id: 'plan-phases',
    icon: '📆',
    title: 'O plano de 90 dias — as 3 fases',
    intro:
      'O plano tem 3 fases de 30 dias, com uma rotina diária de 1 hora. Princípio central: constância vence intensidade — 1h todo dia rende mais que 7h de uma vez. Se furar um dia, não compense dobrando: só volte no dia seguinte.',
    items: [
      { b: 'Rotina diária (1h):', t: '20 min Ouvir + 15 min Vocabulário + 15 min Fala + 10 min Escrita. O que você ouve de manhã vira card, conversa e texto.' },
      { b: 'Ritmo da semana:', t: 'Seg = shadowing · Ter = conversa com tutor · Qua = shadowing + e-mail · Qui = tutor (tema de trabalho) · Sex = shadowing + gravar-se 2 min · Sáb = imersão leve (1 TED/episódio sem legenda) · Dom = descanso ou revisão.' },
      { b: 'Fase 1 — Dias 1 a 30 · Reativar e criar o hábito:', t: 'reative o inglês adormecido, treine o ouvido e derrube a ansiedade de falar. Comece a falar com o tutor já na 1ª semana — errar cedo é o atalho. Meta: falar 15 min com um tutor sem travar de pânico, mesmo com erros.' },
      { b: 'Fase 2 — Dias 31 a 60 · Fluência e trabalho:', t: 'produção sob pressão parecida com a do trabalho — dar update de projeto, discordar educadamente, apresentar uma ideia, participar de uma "reunião". Troque parte do input para conteúdo autêntico (TED, podcasts do seu setor). Meta: conduzir uma conversa de trabalho de ~10 min com clareza.' },
      { b: 'Fase 3 — Dias 61 a 90 · Polimento profissional:', t: 'soar mais natural e confiante — entrevista, negociação, apresentação de 5 min, small talk. Ataque seus 5 erros mais recorrentes. Meta: fazer uma apresentação de 5 min e responder perguntas de improviso.' },
      { b: 'Marcos:', t: 'Dia 7 (hábito instalado) · Dia 30 (1ª conversa sem pânico) · Dia 45 (assiste sem legenda) · Dia 60 (reunião simulada de 10 min) · Dia 90 (apresentação + Q&A).' },
      { b: 'O erro que sabota:', t: 'ficar só em app de gramática e exercício, sem nunca ouvir muito nem falar. Se faltar tempo, corte a gramática — nunca o input e a fala.' },
    ],
  },
  {
    id: 'dashboard',
    icon: '🏠',
    title: 'Início — seu painel do dia',
    intro: 'A tela inicial mostra onde você está no plano, o que fazer hoje e o que já concluiu.',
    items: [
      { b: 'Cabeçalho:', t: 'seu nome, o dia atual (ex: Dia 12/90), a fase e o streak 🔥.' },
      { b: 'Foco sugerido de hoje:', t: 'uma sugestão do plano para o dia da semana (ex: “conversa com tutor”). É só sugestão — sinta-se livre pra fazer outro bloco.' },
      { b: 'Checklist dos 4 blocos:', t: 'cada bloco (Ouvir, Vocabulário, Fala, Escrita) ganha um ✅ quando você o faz no dia. O contador “X/4 blocos” mostra o progresso.' },
      { b: 'Pare e retome:', t: 'o progresso do dia fica salvo. Se parar no meio, ao voltar você vê exatamente o que já fez e o que falta (ex: “Faltam 6 cards”).' },
      { b: 'Dia concluído:', t: 'o dia só conta como concluído quando você fecha os 4 blocos — e é isso que mantém seu streak 🔥 (dias seguidos completos).' },
      { b: '🎯 Erros recorrentes:', t: 'suas categorias de erro mais comuns nos últimos 30 dias. O tutor e o corretor já prestam atenção extra nelas.' },
      { b: 'Aviso de nível:', t: 'se as perguntas de compreensão que você vem respondendo indicarem que seu nível está desajustado, aparece uma faixa no topo sugerindo mudar. É sugestão: nada muda sem você abrir o Perfil e confirmar. Dá pra dispensar no ✕.' },
      { b: 'Próximo marco:', t: 'aparece no rodapé, pra você saber o que vem pela frente.' },
    ],
  },
  {
    id: 'listening',
    icon: '🎧',
    title: 'Ouvir — treinar o listening',
    intro: 'Três formas de treinar o listening, nas abas Diálogo (IA), YouTube e Sugestões.',
    items: [
      { b: 'Diálogo (IA) — Gerar:', t: 'digite um tema (ou toque num sugerido, como “Job interview”) e clique em Gerar. Em segundos aparece o diálogo.' },
      { b: 'Surpreenda-me 🎲:', t: 'o Claude escolhe um tema fresco e variado e já gera o diálogo — ótimo quando você não sabe o que praticar.' },
      { b: 'YouTube:', t: 'cole a URL de um vídeo com legendas: você ouve o áudio real e vê a transcrição em trechos, com “+ card” para salvar frases (traduzidas na hora).' },
      { b: 'Clicar na frase:', t: 'na transcrição do YouTube, tocar em qualquer frase pula o vídeo direto para aquele momento — dá para reouvir um trecho difícil quantas vezes quiser sem procurar na barra.' },
      { b: '🌐 mostrar tradução:', t: 'ao marcar, o Mynah traduz o vídeo inteiro de uma vez e guarda no banco. A primeira vez leva alguns minutos (dá para assistir enquanto traduz); depois disso o mesmo vídeo abre já traduzido, na hora e sem gastar IA. A tradução aparece embaixo da fala que está tocando.' },
      { b: 'Se a IA estiver fora do ar:', t: 'no Chrome e no Edge, o Mynah usa o tradutor embutido do próprio navegador para não te deixar sem nada. Essas linhas aparecem com ⚠️ e um aviso no topo: o tradutor do navegador escreve bem, mas erra o que depende de contexto (numa palestra sobre trabalhos acadêmicos, ele traduziu "paper" como "papel" e depois "jornal"). Quando a IA voltar, marque 🌐 de novo e essas linhas são reescritas.' },
      { b: 'Nível do vídeo:', t: 'o Mynah lê a transcrição e estima se o vídeo é A1…C2. Se estiver acima ou abaixo do seu nível, aparece um aviso acima do vídeo — só um aviso: nada fica bloqueado, e um vídeo um degrau acima do seu é justamente onde mais se aprende.' },
      { b: '🔄 atualizar transcrição:', t: 'legendas do YouTube são editadas e as automáticas são regeradas de tempos em tempos. Se a legenda salva ficar velha, o clique na frase pula para o momento errado. Esse botão rebusca a legenda e avisa se mudou — as traduções que continuam valendo são preservadas.' },
      { b: '⭐ Meus canais:', t: 'guarde os canais em que você gosta de procurar vídeo. Cole o endereço do canal (youtube.com/@nome) ou de qualquer vídeo dele — o Mynah descobre o canal sozinho. Clicar num canal abre os vídeos dele; se você digitar um assunto antes, a busca já vai filtrada dentro daquele canal.' },
      { b: '⭐ salvar canal:', t: 'quando um vídeo estiver aberto, esse botão guarda o canal dele nos seus favoritos — útil quando você gosta do sotaque/ritmo e quer mais do mesmo.' },
      { b: 'Sugestões:', t: 'uma lista de canais/podcasts bons de inglês para copiar uma URL e usar na aba YouTube.' },
      { b: 'Ouvir tudo:', t: 'toca o diálogo inteiro em sequência. Durante a narração aparecem os controles ⏸ Pausar, ▶ Retomar e ⏹ Parar.' },
      { b: 'Pausar / Retomar:', t: 'o Pausar interrompe na hora; o Retomar continua a partir da fala em que você parou.' },
      { b: 'Ouvir uma fala só:', t: 'o 🔊 ao lado de cada linha toca apenas aquela fala (e interrompe o que estiver tocando).' },
      { b: 'Mostrar PT:', t: 'exibe a tradução de cada linha, caso você trave em alguma.' },
      { b: '+ card:', t: 'salva aquela fala no seu Vocabulário. Ela vai pro baralho “Frases do dia” já com um contexto (a fala vizinha da conversa) e entra na próxima revisão.' },
      { b: 'Diálogos anteriores:', t: 'ficam listados no fim — toque para reabrir e reouvir quando quiser.' },
      { b: '✅ Testar se entendi:', t: 'abaixo do diálogo há 3 perguntas de compreensão (opcionais, recolhidas). Servem de espelho contra a “escuta passiva” — ouvir sem processar. Sem nota, sem travar nada: você responde, vê a resposta certa e a fala do diálogo que prova.' },
      { b: 'Conclusão do bloco:', t: 'o bloco Ouvir marca ✅ quando você ouve 1 diálogo até o fim (ou ~1 min de vídeo do YouTube).' },
    ],
  },
  {
    id: 'reading',
    icon: '📖',
    title: 'Ler — leitura extensiva no seu nível',
    intro:
      'A IA escreve textos curtos e interessantes no seu nível (que sobe conforme você evolui). Ler muito é metade do inglês profissional — e-mails, docs, mensagens.',
    items: [
      { b: 'Gerar um texto:', t: 'digite um tema, toque num dos sugeridos ou use 🎲 Surpreenda-me. Sai um texto de ~200 palavras, 95% compreensível no seu nível.' },
      { b: 'Toque em qualquer palavra:', t: 'aparece o significado daquela palavra NAQUELA frase (não a tradução genérica do dicionário).' },
      { b: '+ card (frase):', t: 'salva a frase inteira no seu Vocabulário — mineração de frases, como no LingQ/Migaku.' },
      { b: '🔊:', t: 'ouça o texto inteiro ou só a frase da palavra consultada.' },
      { b: 'Leituras anteriores:', t: 'ficam salvas para reler quando quiser.' },
      { b: '✅ Testar se entendi:', t: 'no fim do texto há 3 perguntas de compreensão (opcionais, recolhidas). Errar tudo costuma significar que o texto está acima do seu nível — vale baixar um nível no Perfil.' },
      { b: 'Conteúdo antigo:', t: 'textos e diálogos criados antes desta função ganham um botão “✅ Gerar perguntas de compreensão”. Também dá para preencher tudo de uma vez com `npm run backfill:questions`.' },
      { b: 'Atividade extra:', t: 'não conta bloco do dia — é além da sua 1h, sem culpa.' },
    ],
  },
  {
    id: 'vocab',
    icon: '🗂️',
    title: 'Vocabulário — memorizar com repetição espaçada',
    intro:
      'Usa o FSRS, o algoritmo moderno do Anki (~25% menos revisões que o SM-2 clássico para a mesma retenção). Cada card é uma frase inteira em contexto, com áudio — nunca palavra solta.',
    items: [
      { b: 'Gerar um pack:', t: 'digite um tema (ou toque num sugerido) e o Claude cria ~10 frases úteis sobre ele.' },
      { b: 'Revisar agora:', t: 'abre a sessão de revisão com os cards que vencem hoje.' },
      { b: 'Meta do dia:', t: 'o bloco Vocabulário do Início marca ✅ quando você revisa 20 cards no dia (ou zera os que venceram, se forem menos). Antes disso, mostra o progresso (ex: “12/20 cards”).' },
      { b: 'Modos de revisão:', t: 'os cards repetidos alternam entre 4 exercícios: Traduza (ler EN), ✂️ Complete a lacuna, 🇧🇷→🇬🇧 Fale em inglês (produção!) e 👂 Só de ouvido. Produzir e ouvir fixa muito mais que só reconhecer.' },
      { b: 'Ver a resposta:', t: 'toque no card (ou em “Mostrar resposta”) para ver a tradução e o exemplo em contexto.' },
      { b: 'Avaliar:', t: 'De novo / Difícil / Bom / Fácil. Isso define quando o card volta: “De novo” traz de volta ainda na mesma sessão; os outros agendam para dias à frente.' },
      { b: 'Ver/gerenciar cards:', t: 'na lista “Seus baralhos”, toque num baralho para expandir e ver todas as frases — sem precisar entrar na revisão.' },
      { b: 'Excluir card:', t: 'dentro do baralho, o 🗑 remove um card (útil se salvou algo sem querer no Ouvir). O 🔊 toca a frase.' },
      { b: 'Excluir baralho:', t: 'o botão “Excluir baralho inteiro” apaga o baralho e todos os seus cards (com confirmação).' },
    ],
  },
  {
    id: 'speaking',
    icon: '🗣️',
    title: 'Fala — shadowing e tutor',
    intro: 'Dois modos, alternados pelos botões no topo. Ambos usam o microfone (Chrome/Edge).',
    items: [
      { b: 'Shadowing:', t: 'ouça a frase (a tradução aparece logo abaixo), repita imitando o ritmo e toque em 🎤 Falar. Você recebe uma nota de 0–100% comparando sua fala ao alvo.' },
      { b: 'Navegar no shadowing:', t: 'use “Anterior/Próxima” para trocar de frase; o 🔊 repete o áudio.' },
      { b: 'Tutor (conversa):', t: 'toque em 🎤 para gravar, fale à vontade (ele não corta nas pausas) e toque em “Enviar 🎤” quando terminar — ou escreva no campo de texto. O tutor “Alex” responde, mantém o fio da conversa e corrige de leve, sempre puxando uma pergunta. A conversa fica salva se você trocar de tela.' },
      { b: '🎭 Roleplay:', t: 'um cenário de trabalho com OBJETIVO concreto (“convença o gerente a estender o prazo”). O personagem resiste de verdade e NÃO corrige durante — a avaliação vem no final: objetivo atingido?, nota e frases que teriam soado melhor.' },
      { b: '4·3·2:', t: 'conte a MESMA história 3 vezes com menos tempo (60s → 45s → 30s). A repetição automatiza as frases; o relógio apertando destrava a fluência. Veja suas palavras-por-minuto subirem entre rodadas.' },
      { b: 'Sem microfone?', t: 'o Tutor também funciona só por texto. E lembre: o 🎤 precisa de HTTPS/localhost (veja Dicas).' },
      { b: 'Conclusão do bloco:', t: 'o bloco Fala marca ✅ após 2 práticas (shadowing e/ou respostas do tutor).' },
    ],
  },
  {
    id: 'writing',
    icon: '✍️',
    title: 'Escrita — praticar e corrigir',
    intro: 'Escreva em inglês e receba uma correção detalhada da IA.',
    items: [
      { b: 'Escolher um tema:', t: 'toque num tema sugerido (e-mail, resumo do que ouviu…) ou escreva livre.' },
      { b: 'Corrigir com IA:', t: 'devolve o texto corrigido, a lista de erros explicados em português, uma versão mais natural e um comentário de incentivo.' },
      { b: 'Histórico:', t: 'suas escritas anteriores ficam salvas para consulta.' },
      { b: 'Conclusão do bloco:', t: 'o bloco Escrita marca ✅ com 1 texto corrigido pela IA.' },
    ],
  },
  {
    id: 'history',
    icon: '📅',
    title: 'Histórico — seus dias anteriores',
    intro: 'Mostra tudo o que você já fez, dia a dia — ótimo pra manter a constância.',
    items: [
      { b: 'Calendário/heatmap:', t: 'cada quadradinho é um dia; quanto mais verde, mais blocos você concluiu (0 a 4).' },
      { b: 'Últimos dias:', t: 'uma lista com os ícones dos 4 blocos (coloridos = feitos) e se o dia foi completo.' },
      { b: 'Detalhe do dia:', t: 'toque num quadradinho ou num dia para ver o que fez: cards revisados, diálogos ouvidos, escritas e práticas de fala.' },
    ],
  },
  {
    id: 'profile',
    icon: '⚙️',
    title: 'Perfil — dados, progresso e IA',
    intro: 'Abra o Perfil pelo seu nome/avatar no menu lateral (ou na barra inferior, no celular).',
    items: [
      { b: 'Editar dados:', t: 'mude avatar, nome e a data de início do plano (há um botão “Recomeçar hoje”).' },
      { b: 'Nível de inglês (CEFR):', t: 'A1 (iniciante) até C2 (proficiente) — o padrão internacional. É o piso de dificuldade de TODO conteúdo gerado: cards, diálogos, textos, tutor e roleplay. Se o material estiver difícil demais, baixe um nível: o próximo conteúdo já sai mais simples. Na dúvida, escolha o mais baixo.' },
      { b: '🎯 Descobrir meu nível:', t: 'um teste adaptativo de ~8 minutos, em três partes: quais palavras você conhece (com palavras inventadas plantadas — marcar uma mostra que você está chutando e o bloco deixa de valer), 5 trechos falados para entender, e 8 frases para completar. As perguntas ficam mais difíceis conforme você acerta. O resultado nunca troca seu nível sozinho: ele mostra o que achou, quanto você acertou em cada parte, e você decide. Também aparece logo depois de criar um perfil, e o histórico dos testes fica guardado — refazer no dia 45 mostra a evolução.' },
      { b: 'Sugestão automática de nível:', t: 'as perguntas de compreensão que você responde nos diálogos e textos ficam guardadas junto com o nível do material. Se você vier acertando quase tudo em conteúdo acima do seu nível (ou errando muito no seu próprio), aparece um aviso no Início sugerindo mudar. É só sugestão — nada muda sem o seu clique.' },
      { b: 'Alvo atual:', t: 'abaixo dos níveis o app mostra para qual nível a IA está gerando agora. Ele sobe sozinho a partir do que você escolheu — pelas fases do plano e pelo seu desempenho (erros de escrita, notas de shadowing, acertos nos cards) — mas nunca cai mais de um degrau abaixo da sua escolha.' },
      { b: '🎯 Metas diárias:', t: 'ajuste quantos cards/práticas/textos fecham cada bloco. Numa semana corrida, reduza — constância vale mais que volume.' },
      { b: '🎨 Tema:', t: 'claro, escuro ou automático (segue o sistema).' },
      { b: '🧊 Freeze de streak:', t: 'cada semana completa ganha 1 freeze (máx 2), que protege o streak num dia perdido — viagem ou imprevisto não zera 40 dias de esforço.' },
      { b: '🎯 Erros recorrentes:', t: 'no Início, veja suas categorias de erro mais comuns (últimos 30 dias). O tutor e o corretor já prestam atenção extra nelas.' },
      { b: 'Seu progresso:', t: 'veja streak, melhor streak, total de cards, revisões, escritas, diálogos e falas.' },
      { b: 'Voz:', t: 'na seção 🔊 Voz, escolha uma voz mais natural e ajuste a velocidade (dica: no Microsoft Edge há vozes "Natural" bem realistas). Use "Testar voz" para ouvir.' },
      { b: 'Inteligência Artificial:', t: 'escolha qual IA gera os exercícios — Claude Code (Max), OpenAI Codex, Google Gemini, Ollama (local) ou as APIs com chave. Preencha os campos e use “Testar conexão”.' },
      { b: 'Trocar de perfil:', t: 'volta pra tela de seleção (para você ou sua esposa entrarem).' },
      { b: 'Excluir perfil:', t: 'apaga todos os dados daquele perfil (com confirmação em dois passos).' },
    ],
  },
  {
    id: 'tips',
    icon: '💡',
    title: 'Dicas e microfone',
    intro: 'Detalhes que fazem diferença no dia a dia.',
    items: [
      { b: 'Use Chrome ou Edge:', t: 'o áudio (ouvir e falar) depende deles. Neles o Mynah também consegue traduzir localmente se a IA cair, e narrar o teste de nivelamento sem gastar IA.' },
      { b: 'Permissão de microfone:', t: 'na primeira vez que usar o 🎤, o navegador pede permissão — aceite.' },
      { b: 'No celular:', t: 'acesse pelo endereço HTTPS do seu PC (ex: https://SEU_IP:5173) na mesma Wi-Fi, e aceite o aviso de certificado. O HTTPS é o que libera o microfone fora do computador.' },
      { b: 'Priorize input e fala:', t: 'se faltar tempo, corte a gramática — nunca o ouvir e o falar.' },
    ],
  },
];
