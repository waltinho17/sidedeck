/* Settings window text in both languages: key -> [Português, English].
 * Markup (<b>, <i>) is allowed only in keys used with data-i18n-html. */
const STRINGS = {
  "brand.sub": ["Monitor no celular", "Hardware monitor"],

  "nav.general": ["Geral", "General"],
  "nav.models": ["Modelos", "Models"],
  "nav.layout": ["Layout", "Layout"],
  "nav.appearance": ["Aparência", "Appearance"],
  "nav.cards": ["Cards", "Cards"],
  "nav.video": ["Fundo", "Background"],

  "sidebar.preview": ["Abrir preview", "Open preview"],
  "sidebar.previewHint": ["Abre o painel no navegador", "Opens the panel in your browser"],
  "lang.title": ["Idioma · Language", "Language · Idioma"],
  "lang.auto": ["Automático (Windows)", "Automatic (Windows)"],

  "banner.title": ["Celular conectado sem o app do painel", "Phone connected without the panel app"],
  "banner.dismiss": ["Agora não", "Not now"],
  "banner.install": ["Instalar no celular", "Install on the phone"],
  "banner.model": ["{model} — instale o app para ver o painel na tela dele.", "{model} — install the app to see the panel on its screen."],
  "banner.installing": ["Instalando...", "Installing..."],

  "general.sub": ["Conexão com o celular e ritmo de atualização dos dados.", "Phone connection and how often data is refreshed."],

  "phone.title": ["Celular", "Phone"],
  "phone.hint": [
    "Conecte pelo cabo USB com a <b>Depuração USB</b> ligada (Configurações › Opções do desenvolvedor).",
    "Connect it with a USB cable and <b>USB debugging</b> turned on (Settings › Developer options).",
  ],
  "phone.searching": ["Procurando celular...", "Looking for a phone..."],
  "phone.none": ["Nenhum celular detectado", "No phone detected"],
  "phone.unauthorized": [
    "Celular detectado, mas sem permissão — toque em \"Permitir\" no aviso de depuração USB na tela do celular (veja o passo 3 abaixo)",
    "Phone detected, but not allowed yet — tap \"Allow\" on the USB debugging prompt on the phone's screen (see step 3 below)",
  ],
  "phone.offline": [
    "Celular detectado, mas ainda não respondeu — desconecte e conecte o cabo",
    "Phone detected, but it isn't responding yet — unplug and plug the cable back in",
  ],
  "phone.ready": ["{model} conectado", "{model} connected"],
  "phone.fallbackModel": ["Celular", "Phone"],
  "phone.needAuth": ["Conecte o celular com a depuração USB permitida", "Connect the phone with USB debugging allowed"],

  "app.install": ["Instalar app", "Install app"],
  "app.reinstall": ["Reinstalar / atualizar", "Reinstall / update"],
  "app.waiting": ["App do painel: aguardando o celular", "Panel app: waiting for the phone"],
  "app.installed": ["App do painel instalado", "Panel app installed"],
  "app.notInstalled": ["App do painel não instalado", "Panel app not installed"],
  "app.installing": ["Instalando no celular... (pode levar alguns segundos)", "Installing on the phone... (this can take a few seconds)"],
  "app.installDone": ["Instalado! O painel já foi aberto no celular.", "Installed! The panel is already open on the phone."],
  "app.installFailed": [
    "Falha ao instalar: {error} — veja \"Problemas para instalar pelo cabo?\" abaixo.",
    "Install failed: {error} — see \"Trouble installing over the cable?\" below.",
  ],

  "adb.checking": ["Verificando...", "Checking..."],
  "adb.connected": ["Conectado — túnel adb reverse ativo", "Connected — adb reverse tunnel active"],
  "adb.disconnected": [
    "Desconectado — verifique o cabo USB e a depuração USB no celular",
    "Disconnected — check the USB cable and USB debugging on the phone",
  ],
  "adb.reconnect": ["Reconectar", "Reconnect"],
  "adb.reconnecting": ["Reconectando...", "Reconnecting..."],
  "adb.reconnectWait": ["Tentando reconectar (pode levar alguns segundos)...", "Trying to reconnect (this can take a few seconds)..."],
  "adb.reconnectFailed": ["Não reconectou: {error}", "Couldn't reconnect: {error}"],

  "guide.title": ["Primeira vez? Como preparar o celular", "First time? How to set up the phone"],
  "guide.step1": [
    "<b>Ligue as Opções do desenvolvedor:</b> abra <i>Configurações › Sobre o telefone</i> e toque 7 vezes seguidas em <i>Número da versão</i> (Samsung: <i>Informações do software › Número de compilação</i>; Xiaomi, Redmi e POCO: <i>Versão da MIUI</i> ou <i>Versão do SO</i>). Pode pedir o PIN do celular.",
    "<b>Turn on Developer options:</b> open <i>Settings › About phone</i> and tap <i>Build number</i> 7 times in a row (Samsung: <i>Software information › Build number</i>; Xiaomi, Redmi and POCO: <i>MIUI version</i> or <i>OS version</i>). It may ask for the phone's PIN.",
  ],
  "guide.step2": [
    "<b>Ligue a Depuração USB:</b> em <i>Configurações › Opções do desenvolvedor</i> (em alguns celulares fica em <i>Sistema</i> ou <i>Configurações adicionais</i>), ative <i>Depuração USB</i>.",
    "<b>Turn on USB debugging:</b> in <i>Settings › Developer options</i> (on some phones it's under <i>System</i> or <i>Additional settings</i>), turn on <i>USB debugging</i>.",
  ],
  "guide.step3": [
    "<b>Conecte o cabo e autorize o PC:</b> na tela do celular aparece <i>Permitir depuração USB?</i>. Marque <i>Sempre permitir deste computador</i> e toque em <i>Permitir</i>. Se o aviso não aparecer, desconecte e conecte o cabo de novo.",
    "<b>Plug in the cable and authorize the PC:</b> the phone shows <i>Allow USB debugging?</i>. Check <i>Always allow from this computer</i> and tap <i>Allow</i>. If the prompt doesn't show up, unplug and plug the cable in again.",
  ],
  "guide.step4": [
    "<b>Xiaomi, Redmi e POCO:</b> nas Opções do desenvolvedor, ligue também <i>Instalar via USB</i> (pede a conta Mi e às vezes um chip no celular) e <i>Depuração USB (Configurações de segurança)</i>, que deixa o SideDeck acender a tela.",
    "<b>Xiaomi, Redmi and POCO:</b> in Developer options, also turn on <i>Install via USB</i> (needs a Mi account and sometimes a SIM card) and <i>USB debugging (Security settings)</i>, which lets SideDeck turn the screen on.",
  ],
  "guide.step5": [
    "Pronto: o status acima fica verde e o botão <i>Instalar app</i> aparece. Use cabo de dados (alguns cabos só carregam).",
    "Done: the status above turns green and the <i>Install app</i> button shows up. Use a data cable (some cables only charge).",
  ],

  "manual.title": ["Problemas para instalar pelo cabo?", "Trouble installing over the cable?"],
  "manual.intro": [
    "Alguns celulares bloqueiam a instalação pelo USB. Nesse caso, instale o app manualmente:",
    "Some phones block installs over USB. In that case, install the app by hand:",
  ],
  "manual.step1": [
    "<b>Com o cabo:</b> copie o instalador para a pasta Downloads do celular, abra <i>Meus arquivos › Downloads</i> e toque em <i>SideDeck-Display.apk</i>.",
    "<b>With the cable:</b> copy the installer to the phone's Downloads folder, open <i>Files › Downloads</i> and tap <i>SideDeck-Display.apk</i>.",
  ],
  "manual.step2": [
    "<b>Sem o cabo:</b> abra a pasta do instalador no PC e envie o arquivo para o celular como preferir (WhatsApp, Drive, e-mail...).",
    "<b>Without the cable:</b> open the installer folder on the PC and send the file to the phone any way you like (messaging app, Drive, e-mail...).",
  ],
  "manual.unknownApps": [
    "Se o celular perguntar, permita <i>instalar apps desconhecidos</i> para o app que abriu o arquivo.",
    "If the phone asks, allow <i>install unknown apps</i> for the app that opened the file.",
  ],
  "manual.copy": ["Copiar para o celular", "Copy to the phone"],
  "manual.reveal": ["Abrir pasta do instalador", "Open installer folder"],
  "manual.copying": ["Copiando...", "Copying..."],
  "manual.copied": [
    "Pronto! Copiado para {where}. No celular, abra Meus arquivos › Downloads e toque no arquivo.",
    "Done! Copied to {where}. On the phone, open Files › Downloads and tap the file.",
  ],
  "manual.copyFailed": [
    "Não deu para copiar: {error}. Use \"Abrir pasta do instalador\".",
    "Couldn't copy: {error}. Use \"Open installer folder\".",
  ],
  "manual.revealFailed": ["Não deu para abrir a pasta: {error}", "Couldn't open the folder: {error}"],

  "auto.title": ["Funcionamento automático", "Hands-free operation"],
  "auto.hint": [
    "Para deixar um celular fixo dentro do PC, como uma telinha, funcionando sem precisar tocar nele.",
    "For a phone mounted inside the PC as a little screen that works without ever touching it.",
  ],
  "auto.startup": ["Iniciar o SideDeck junto com o Windows", "Start SideDeck with Windows"],
  "auto.startupHint": [
    "Abre escondido, só no ícone perto do relógio. Vale na hora, sem precisar salvar.",
    "Starts hidden, only as an icon next to the clock. Takes effect right away, no need to save.",
  ],
  "auto.dedicated": ["Tela dedicada (celular fixo no PC)", "Dedicated screen (phone mounted in the PC)"],
  "auto.dedicatedHint": [
    "Com o celular no cabo, o SideDeck acende a tela, abre o painel e o traz de volta se outro app aparecer. O painel vira o app de início do celular, então ele também abre sozinho quando o celular liga. Com o PC desligado, a tela escurece e apaga sozinha. Não use num celular do dia a dia: ele fica preso no painel enquanto estiver no cabo.",
    "While the phone is on the cable, SideDeck turns its screen on, opens the panel and brings it back if another app shows up. The panel becomes the phone's home app, so it also opens by itself when the phone boots. With the PC off, the screen dims and turns off by itself. Don't use it on your everyday phone: it stays locked to the panel while plugged in.",
  ],

  "tips.title": ["Dicas para deixar um celular fixo dentro do PC", "Tips for a phone mounted inside the PC"],
  "tips.step1": [
    "<b>Autorização que não expira:</b> em <i>Opções do desenvolvedor</i>, ligue <i>Desativar tempo limite de autorizações adb</i> (Android 11 ou mais novo). Sem isso, o celular pode esquecer a autorização do PC e pedir de novo o toque em <i>Permitir</i>.",
    "<b>Authorization that never expires:</b> in <i>Developer options</i>, turn on <i>Disable adb authorization timeout</i> (Android 11 or newer). Without it, the phone may forget the PC and ask for the <i>Allow</i> tap again.",
  ],
  "tips.step2": [
    "<b>Sem senha:</b> em <i>Configurações › Tela de bloqueio</i>, escolha <i>Nenhum</i> ou <i>Deslizar</i>. Com PIN o painel ainda aparece por cima do bloqueio, mas o resto do celular fica travado.",
    "<b>No password:</b> in <i>Settings › Lock screen</i>, choose <i>None</i> or <i>Swipe</i>. With a PIN the panel still shows over the lock screen, but the rest of the phone stays locked.",
  ],
  "tips.step3": [
    "<b>Não deixe o Android fechar o app:</b> em <i>Configurações › Apps › SideDeck Display › Bateria</i>, escolha <i>Sem restrições</i>. Xiaomi, Redmi e POCO: ligue também <i>Início automático</i> na página do app.",
    "<b>Don't let Android close the app:</b> in <i>Settings › Apps › SideDeck Display › Battery</i>, choose <i>Unrestricted</i>. Xiaomi, Redmi and POCO: also turn on <i>Autostart</i> on the app's page.",
  ],
  "tips.step4": [
    "<b>Proteja a bateria:</b> um celular carregando o tempo todo pode estufar a bateria. Se ele tiver limite de carga (Samsung: <i>Proteger bateria</i>; outros: <i>Carregamento otimizado</i> ou <i>Proteção da bateria</i>), ative. Deixe o celular num lugar ventilado, longe do calor da placa de vídeo.",
    "<b>Protect the battery:</b> a phone that is always charging can end up with a swollen battery. If it has a charge limit (Samsung: <i>Protect battery</i>; others: <i>Optimized charging</i> or <i>Battery protection</i>), turn it on. Keep the phone somewhere ventilated, away from the graphics card's heat.",
  ],
  "tips.step5": [
    "<b>Energia do USB:</b> ligue o celular numa porta USB da placa-mãe (atrás do gabinete) e não num hub. Se o Windows desligar a porta para economizar energia, desative <i>Suspensão seletiva de USB</i> nas opções de energia do Windows.",
    "<b>USB power:</b> plug the phone into a motherboard USB port (at the back of the case), not a hub. If Windows turns the port off to save power, disable <i>USB selective suspend</i> in the Windows power options.",
  ],
  "tips.step6": [
    "<b>Atualizações do sistema:</b> desative as atualizações automáticas do Android, que reiniciam o celular e podem trocar opções.",
    "<b>System updates:</b> turn off Android's automatic updates, which restart the phone and may change settings.",
  ],

  "update.title": ["Atualização de dados", "Data refresh"],
  "update.hint": ["Com que frequência os sensores são lidos e enviados ao celular.", "How often the sensors are read and sent to the phone."],

  "models.sub": [
    "Escolha o visual do painel. Clique num modelo para ver como ele fica antes de usar.",
    "Pick the panel's look. Click a model to see what it looks like before using it.",
  ],
  "models.inUse": ["Em uso", "In use"],
  "models.use": ["Usar este modelo", "Use this model"],
  "models.tryPhone": ["Ver no celular por 15 s", "Show on the phone for 15 s"],
  "models.tryPhoneOn": [
    "Mostrando \"{model}\" no celular por 15 segundos. Depois ele volta sozinho para o modelo em uso.",
    "Showing \"{model}\" on the phone for 15 seconds. It then goes back to the model in use by itself.",
  ],
  "models.tryPhoneFailed": ["Não deu para mostrar no celular: {error}", "Couldn't show it on the phone: {error}"],
  "models.live": ["Abrir no navegador", "Open in browser"],
  "models.tip": ["Dica: clique duas vezes num modelo para usar direto.", "Tip: double-click a model to use it right away."],
  "models.applied": [
    "Pronto! O celular já está mostrando o modelo {model}.",
    "Done! The phone is now showing the {model} model.",
  ],
  "models.useFailed": ["Não deu para trocar o modelo: {error}", "Couldn't switch the model: {error}"],
  "models.footnote": [
    "As imagens mostram o visual padrão de cada modelo. <b>Ver no celular</b> e <b>Abrir no navegador</b> usam as suas cores e os dados reais do PC. Cada modelo guarda seu próprio layout e cores (abas Layout e Aparência).",
    "The pictures show each model's default look. <b>Show on the phone</b> and <b>Open in browser</b> use your colors and the PC's real data. Each model keeps its own layout and colors (Layout and Appearance tabs).",
  ],
  "model.full": ["Completo", "Full"],
  "model.minimal": ["Minimalista", "Minimal"],
  "model.amoled": ["AMOLED", "AMOLED"],
  "model.osd": ["Afterburner", "Afterburner"],
  "model.temps": ["Temperaturas", "Temperatures"],
  "model.glass": ["Vidro", "Glass"],
  "model.full.desc": [
    "Cards de CPU e GPU com anel de uso e até 4 informações cada (temperatura, clock, consumo, ventoinha, VRAM), mais RAM, rede e armazenamento.",
    "CPU and GPU cards with a load ring and up to 4 readings each (temperature, clock, power, fan, VRAM), plus RAM, network and storage.",
  ],
  "model.minimal.desc": [
    "Anéis grandes com os sensores que você escolher, redimensionados para ocupar a tela. Bom para ler de longe.",
    "Big rings with the sensors you pick, resized to fill the screen. Easy to read from across the room.",
  ],
  "model.amoled.desc": [
    "Fundo preto de verdade e só traços finos acesos: ideal para telas AMOLED/OLED, com mais profundidade, menos bateria e menos calor. Mesma disposição do Vidro: CPU e GPU grandes, RAM, VRAM, rede e armazenamento.",
    "True black with only thin strokes lit: made for AMOLED/OLED screens, with more depth, less battery use and less heat. Same layout as Glass: big CPU and GPU, plus RAM, VRAM, network and storage.",
  ],
  "model.osd.desc": [
    "Linhas de texto, como o overlay do MSI Afterburner: CPU, GPU, RAM, FPS, frametime, 1% low. Com o Afterburner aberto mostra exatamente os sensores que você marcou para a tela do jogo.",
    "Lines of text like MSI Afterburner's overlay: CPU, GPU, RAM, FPS, frametime, 1% low. With Afterburner running it shows exactly the sensors you ticked for the in-game display.",
  ],
  "model.temps.desc": [
    "Só as temperaturas da CPU e da GPU: números enormes ou anéis com degradê. Posição, legenda e tamanho ajustáveis.",
    "Just the CPU and GPU temperatures: huge numbers or gradient rings. Position, caption and size are adjustable.",
  ],
  "model.glass.desc": [
    "Cartões de vidro fosco, como no iOS, sobre um fundo colorido em movimento ou sobre o seu vídeo. CPU e GPU com anel em degradê, mais RAM, VRAM, rede e armazenamento.",
    "Frosted glass cards, iOS style, over a moving color background or your video. CPU and GPU with a gradient ring, plus RAM, VRAM, network and storage.",
  ],

  "layout.sub": ["Barra superior, unidades e proporções dos elementos.", "Top bar, units and element proportions."],
  "scope.editing": ["Editando o modelo", "Editing model"],
  "scope.copy": ["Copiar para os outros", "Copy to the others"],
  "scope.copied": ["Copiado para os outros modelos — salve para aplicar", "Copied to the other models — save to apply"],

  "topbar.title": ["Barra superior", "Top bar"],
  "topbar.brandText": ["Texto do título", "Title text"],
  "topbar.brandPlaceholder": ["ex: SideDeck", "e.g. SideDeck"],
  "common.show": ["Mostrar", "Show"],
  "topbar.clock": ["Hora", "Clock"],
  "topbar.clockSwitch": ["Mostrar a hora", "Show the clock"],
  "topbar.emptyHint": [
    "Com título, hora, FPS e ícone desligados, a barra some e o painel ganha a tela inteira.",
    "With the title, clock, FPS and icon all off, the bar goes away and the panel gets the whole screen.",
  ],
  "topbar.clockFormat": ["Formato da hora", "Clock format"],
  "topbar.clockPosition": ["Posição da hora", "Clock position"],
  "topbar.cornerIcon": ["Ícone do canto", "Corner icon"],
  "topbar.cornerIconSwitch": ["Mostrar ícone no canto superior direito", "Show the icon in the top right corner"],
  "topbar.fps": ["Contador de FPS", "FPS counter"],
  "topbar.fpsSwitch": ["Mostrar FPS no canto superior direito", "Show FPS in the top right corner"],
  "topbar.fpsHint": [
    "Lido do MSI Afterburner + RivaTuner (RTSS): os dois precisam estar abertos e o \"Framerate\" ativado no monitoramento do Afterburner. Fora de jogos aparece \"--\".",
    "Read from MSI Afterburner + RivaTuner (RTSS): both must be running, with \"Framerate\" enabled in Afterburner's monitoring. Outside games it shows \"--\".",
  ],
  "topbar.fpsScale": ["Tamanho do FPS", "FPS size"],

  "pos.left": ["Esquerda", "Left"],
  "pos.center": ["Centro", "Center"],
  "pos.right": ["Direita", "Right"],
  "pos.top": ["Em cima", "Top"],
  "pos.middle": ["No meio", "Middle"],
  "pos.bottom": ["Embaixo", "Bottom"],

  "sensors.title": ["Sensores", "Sensors"],
  "sensors.gridHint": [
    "Do jeito que aparece no celular. Arraste um anel para mudar a posição; clique no × para tirar.",
    "Laid out just like on the phone. Drag a ring to move it; click the × to remove it.",
  ],
  "sensors.add": ["Adicionar:", "Add:"],
  "sensors.remove": ["Tirar do painel", "Remove from the panel"],
  "sensors.empty": ["Nenhum anel. Adicione sensores abaixo.", "No rings. Add sensors below."],
  "sensors.max": ["Máximo de {limit} — desmarque outro primeiro", "Up to {limit} — uncheck another one first"],
  "sensors.up": ["Subir", "Move up"],
  "sensors.down": ["Descer", "Move down"],
  "cardInfo.title": ["Informações dos cards", "Card readings"],
  "cardInfo.hint": [
    "O que aparece ao lado do anel de uso da CPU e da GPU. Até 4 em cada card.",
    "What shows next to the CPU and GPU load rings. Up to 4 per card.",
  ],

  "osdline.cpu": ["CPU (temperatura, uso, clock, consumo)", "CPU (temperature, load, clock, power)"],
  "osdline.gpu": ["GPU (temperatura, uso, clock, consumo, ventoinha)", "GPU (temperature, load, clock, power, fan)"],
  "osdline.vram": ["VRAM", "VRAM"],
  "osdline.ram": ["RAM", "RAM"],
  "osdline.fps": ["FPS, frametime, 1% low, 0,1% low, média", "FPS, frametime, 1% low, 0.1% low, average"],
  "osdline.net": ["Rede (download e upload)", "Network (download and upload)"],
  "osdline.disk": ["Discos", "Drives"],
  "sensor.cpu_load": ["Uso da CPU", "CPU load"],
  "sensor.cpu_temp": ["Temperatura da CPU", "CPU temperature"],
  "sensor.cpu_clock": ["Clock da CPU", "CPU clock"],
  "sensor.cpu_power": ["Consumo da CPU (W)", "CPU power (W)"],
  "sensor.gpu_load": ["Uso da GPU", "GPU load"],
  "sensor.gpu_temp": ["Temperatura da GPU", "GPU temperature"],
  "sensor.gpu_clock": ["Clock da GPU", "GPU clock"],
  "sensor.gpu_power": ["Consumo da GPU (W)", "GPU power (W)"],
  "sensor.gpu_fan": ["Ventoinha da GPU", "GPU fan"],
  "sensor.vram": ["Memória da GPU (VRAM)", "GPU memory (VRAM)"],
  "sensor.ram_load": ["Uso da RAM", "RAM usage"],
  "sensor.disk": ["Uso do disco", "Disk usage"],
  "sensor.net_down": ["Download", "Download"],
  "sensor.net_up": ["Upload", "Upload"],
  "sensor.fps": ["FPS", "FPS"],
  "stat.temp": ["Temperatura", "Temperature"],
  "stat.clock": ["Clock", "Clock"],
  "stat.power": ["Consumo (W)", "Power (W)"],
  "stat.fan": ["Ventoinha", "Fan"],
  "stat.vram": ["Memória (VRAM)", "Memory (VRAM)"],

  "temps.title": ["Modelo Temperaturas", "Temperatures model"],
  "temps.hint": ["Posição e tamanho das duas leituras.", "Position and size of the two readings."],
  "temps.style": ["Estilo", "Style"],
  "temps.styleNumbers": ["Números", "Numbers"],
  "temps.styleRings": ["Anéis com degradê", "Gradient rings"],
  "temps.caption": ["Legenda CPU / GPU", "CPU / GPU caption"],
  "temps.captionAbove": ["Em cima", "Above"],
  "temps.captionBelow": ["Embaixo", "Below"],
  "temps.captionSide": ["Ao lado", "Beside"],
  "temps.captionNone": ["Sem legenda", "No caption"],
  "temps.captionHint": ["No estilo Anéis, a legenda fica dentro do anel.", "In the Rings style, the caption sits inside the ring."],
  "temps.layout": ["Disposição", "Arrangement"],
  "temps.row": ["Lado a lado", "Side by side"],
  "temps.column": ["Uma embaixo da outra", "Stacked"],
  "temps.align": ["Posição horizontal", "Horizontal position"],
  "temps.valign": ["Posição vertical", "Vertical position"],
  "temps.order": ["Ordem", "Order"],
  "temps.cpuFirst": ["CPU primeiro", "CPU first"],
  "temps.gpuFirst": ["GPU primeiro", "GPU first"],
  "temps.orderHint": [
    "A primeira fica à esquerda (lado a lado) ou em cima (uma embaixo da outra).",
    "The first one goes on the left (side by side) or on top (stacked).",
  ],
  "temps.spacing": ["Distribuição", "Spacing"],
  "temps.together": ["Juntas", "Together"],
  "temps.spread": ["Afastadas, nas bordas opostas", "Apart, on opposite edges"],
  "temps.cpuScale": ["Tamanho da CPU", "CPU size"],
  "temps.gpuScale": ["Tamanho da GPU", "GPU size"],
  "temps.margin": ["Distância das bordas", "Distance from the edges"],
  "temps.details": ["Detalhes", "Details"],
  "temps.unit": ["Unidade °C", "°C unit"],

  "units.title": ["Unidades", "Units"],
  "units.freq": ["Frequência", "Frequency"],
  "units.ghzSample": ["3,50 GHz", "3.50 GHz"],
  "units.mem": ["Memória", "Memory"],
  "units.gbSample": ["9,8 GB", "9.8 GB"],

  "prop.title": ["Proporções", "Proportions"],
  "prop.hint": ["Espessura dos gráficos e arredondamento dos cantos.", "Graph thickness and corner rounding."],
  "prop.bar": ["Espessura das barras", "Bar thickness"],
  "prop.ring": ["Espessura dos anéis", "Ring thickness"],
  "prop.icons": ["Tamanho dos ícones", "Icon size"],
  "prop.corners": ["Cantos", "Corners"],
  "prop.square": ["Quadrado", "Square"],
  "prop.slight": ["Leve", "Slight"],
  "prop.rounded": ["Arredondado", "Rounded"],
  "prop.veryRounded": ["Bem redondo", "Very round"],
  "glass.title": ["Modelo Vidro", "Glass model"],
  "glass.hint": [
    "Com um vídeo ou imagem em Fundo › Sempre no fundo, os cartões ficam como vidro. Sem fundo, o fundo é um degradê nas cores de destaque.",
    "With a video or picture under Background › Always in the background, the cards look like glass. Without one, the background is a gradient in the accent colors.",
  ],
  "glass.blur": [
    "Desfoque do fundo nos cartões (0% = vidro transparente, vídeo fluido)",
    "Background blur inside the cards (0% = clear glass, smooth video)",
  ],
  "glass.blurHint": [
    "Com vídeo, qualquer valor acima de 0% faz o vídeo dentro dos cartões rodar a ~8 quadros por segundo (pesado e travado em celular fraco). Com imagem parada o desfoque não custa nada.",
    "With a video, anything above 0% makes the video inside the cards run at ~8 frames per second (heavy and choppy on a weak phone). With a still picture the blur costs nothing.",
  ],
  "openrgb.btn": ["Usar as cores do OpenRGB", "Use OpenRGB colors"],
  "openrgb.hint": [
    "Pega as cores que estão acesas agora nos seus dispositivos RGB. No OpenRGB, abra SDK Server e clique em Start Server.",
    "Picks the colors currently lit on your RGB devices. In OpenRGB, open SDK Server and click Start Server.",
  ],
  "openrgb.reading": ["Lendo o OpenRGB...", "Reading OpenRGB..."],
  "openrgb.done": ["Cores aplicadas a partir de {n} dispositivo(s) do OpenRGB. Falta salvar.", "Colors applied from {n} OpenRGB device(s). Remember to save."],
  "fit.title": ["Ajuste na tela", "Fit to screen"],
  "fit.hint": [
    "Como o vídeo ou a imagem ocupa a tela do celular. Automático: vídeos preenchem a tela (cortando as bordas) e imagens aparecem inteiras.",
    "How the video or picture fills the phone screen. Automatic: videos fill the screen (cropping the edges) and pictures are shown whole.",
  ],
  "fit.auto": ["Automático", "Automatic"],
  "fit.cover": ["Preencher (corta)", "Fill (crops)"],
  "fit.contain": ["Mostrar inteira", "Show whole"],
  "fit.fill": ["Esticar", "Stretch"],
  "glass.frost": ["Desfocar o vídeo dentro dos cartões (pesado)", "Blur the video inside the cards (heavy)"],
  "models.apply": ["Aplicar", "Apply"],
  "models.applyShort": ["Em uso", "In use"],
  "models.browserTip": ["Abrir no navegador", "Open in browser"],
  "models.browserShort": ["Navegador", "Browser"],
  "osd.labels": ["Nomes das linhas", "Line names"],
  "osd.labelsHint": ["Deixe em branco para usar o nome padrão. O Afterburner não informa os nomes que você deu lá, então digite aqui.", "Leave empty for the default name. Afterburner doesn't share the names you set there, so type them here."],
  "osd.title": ["Linhas de texto", "Lines of text"],
  "osd.hint": [
    "Texto puro, como o overlay do MSI Afterburner. Com o Afterburner aberto o painel mostra os mesmos sensores que você marcou para aparecer na tela do jogo.",
    "Plain text, like MSI Afterburner's overlay. With Afterburner running, the panel shows the same sensors you ticked to appear in-game.",
  ],
  "osd.source": ["Quais linhas mostrar", "Which lines to show"],
  "osd.fromAb": ["Iguais ao Afterburner", "Same as Afterburner"],
  "osd.fromHere": ["Escolher aqui", "Pick here"],
  "osd.sourceHint": ["Sem o Afterburner aberto, usa as linhas escolhidas abaixo.", "With Afterburner closed, the lines picked below are used."],
  "osd.lines": ["Linhas escolhidas aqui", "Lines picked here"],
  "osd.scale": ["Tamanho do texto", "Text size"],
  "osd.scaleHint": ["100% = o maior tamanho que cabe na tela.", "100% = the largest size that fits the screen."],
  "osd.align": ["Posição horizontal", "Horizontal position"],
  "osd.valign": ["Posição vertical", "Vertical position"],
  "glass.opacity": ["Vidro fosco", "Frost"],
  "glass.animated": [
    "Fundo colorido em movimento (quando não há vídeo)",
    "Moving color background (when there's no video)",
  ],

  "appearance.sub": ["Cores e escala geral do painel.", "Colors and overall scale of the panel."],
  "presets.title": ["Predefinições", "Presets"],
  "preset.orange": ["Laranja", "Orange"],
  "preset.pink": ["Pink / Ciano", "Pink / Cyan"],
  "preset.purple": ["Roxo / Rosa", "Purple / Pink"],
  "preset.green": ["Verde Neon", "Neon Green"],
  "preset.blue": ["Azul Elétrico", "Electric Blue"],
  "preset.teal": ["Turquesa", "Turquoise"],
  "preset.amber": ["Âmbar", "Amber"],
  "preset.ice": ["Gelo", "Ice"],
  "preset.mono": ["Monocromático", "Monochrome"],
  "colors.title": ["Cores", "Colors"],
  "colors.bg": ["Fundo", "Background"],
  "colors.card": ["Fundo do card", "Card background"],
  "colors.text": ["Texto", "Text"],
  "colors.muted": ["Texto secundário", "Secondary text"],
  "colors.accent": ["Destaque", "Accent"],
  "colors.accent2": ["Destaque 2 (gradiente)", "Accent 2 (gradient)"],
  "font.title": ["Fonte", "Font"],
  "font.system": ["Sistema", "System"],
  "scale.title": ["Escala", "Scale"],
  "scale.hint": [
    "O tamanho da fonte escala tudo junto: textos, anéis, barras e ícones.",
    "The font size scales everything together: text, rings, bars and icons.",
  ],
  "scale.size": ["Tamanho geral", "Overall size"],
  "scale.density": ["Espaçamento", "Spacing"],

  "cards.sub": ["Escolha o que aparece no painel do celular.", "Choose what shows on the phone's panel."],
  "cards.onlyFull": [
    "Ligar e desligar cards só vale para o modelo <b>Completo</b>. No Minimalista, escolha os anéis em Layout › Sensores.",
    "Turning cards on and off only applies to the <b>Full</b> model. In Minimal, pick the rings in Layout › Sensors.",
  ],
  "cards.network": ["Rede", "Network"],
  "cards.storage": ["Armazenamento", "Storage"],
  "names.title": ["Nomes dos dispositivos", "Device names"],
  "names.hint": [
    "Troque o nome que aparece no painel. Deixe em branco para usar o nome detectado. Vale para todos os modelos.",
    "Change the name shown on the panel. Leave it blank to use the detected name. Applies to every model.",
  ],
  "names.cpu": ["Processador", "Processor"],
  "names.gpu": ["Placa de vídeo", "Graphics card"],

  "video.sub": ["Vídeo ou imagem de fundo, ou descanso de tela.", "Video or picture background, or screensaver."],
  "video.mode": ["Modo", "Mode"],
  "video.off": ["Desativado", "Off"],
  "video.cycle": ["Descanso de tela", "Screensaver"],
  "video.always": ["Sempre no fundo", "Always in the background"],
  "video.overlay": ["Escurecimento do fundo", "Background dimming"],
  "video.overlayHint": [
    "Quanto o vídeo ou a imagem fica escurecido atrás do painel, para os números aparecerem melhor. 0% mostra o fundo sem escurecer.",
    "How much the video or picture is darkened behind the panel so the numbers stand out. 0% shows it as is.",
  ],
  "video.cycleTitle": ["Ciclo", "Cycle"],
  "video.cycleHint": [
    "De quanto em quanto tempo o vídeo entra, e por quanto tempo fica.",
    "How often the video comes on, and for how long it stays.",
  ],
  "video.every": ["A cada", "Every"],
  "video.stay": ["Ficar por", "Stay for"],
  "video.tempsTitle": ["Temperaturas no descanso", "Temperatures on the screensaver"],
  "video.tempsHint": [
    "Mostra CPU e GPU discretamente num canto enquanto o vídeo está na tela.",
    "Shows CPU and GPU discreetly in a corner while the video is on screen.",
  ],
  "video.tempsSwitch": ["Mostrar temperaturas sobre o vídeo", "Show temperatures over the video"],
  "video.corner": ["Canto", "Corner"],
  "corner.tl": ["Sup. esquerdo", "Top left"],
  "corner.tr": ["Sup. direito", "Top right"],
  "corner.bl": ["Inf. esquerdo", "Bottom left"],
  "corner.br": ["Inf. direito", "Bottom right"],
  "video.gallery": ["Vídeos e imagens", "Videos and pictures"],
  "video.galleryHint": ["Passe o mouse sobre um vídeo para ver ele rodando. Imagens ficam paradas.", "Hover over a video to watch it play. Pictures stay still."],
  "video.limits": [
    "Vídeos: até 80 MB e 1920×1080 (Full HD), .webm ou .mp4. Imagens: até 15 MB e 3840 px no lado maior, .jpg, .png ou .webp.",
    "Videos: up to 80 MB and 1920×1080 (Full HD), .webm or .mp4. Pictures: up to 15 MB and 3840 px on the long side, .jpg, .png or .webp.",
  ],
  "video.imageTooBig": ["{name} tem mais de {max} MB.", "{name} is larger than {max} MB."],
  "video.imageTooLarge": [
    "{name} tem {width}×{height}: o limite é {max} px no lado maior.",
    "{name} is {width}×{height}: the limit is {max} px on the long side.",
  ],
  "video.tooBig": [
    "{name} tem mais de {max} MB. Vídeos grandes pesam no celular: reduza o tamanho (o HandBrake faz isso de graça).",
    "{name} is over {max} MB. Big videos weigh on the phone: make it smaller (HandBrake does it for free).",
  ],
  "video.tooLarge": [
    "{name} é {width}×{height}. O máximo é 1920×1080: muitos celulares não conseguem tocar vídeos maiores.",
    "{name} is {width}×{height}. The limit is 1920×1080: many phones can't play bigger videos.",
  ],
  "video.unsupported": [
    "Não consegui abrir {name}. Use .webm (VP9) ou .mp4 (H.264).",
    "Couldn't open {name}. Use .webm (VP9) or .mp4 (H.264).",
  ],
  "video.add": ["+ Adicionar vídeo ou imagem", "+ Add video or picture"],
  "video.remove": ["Remover vídeo", "Remove video"],
  "video.listFailed": ["Erro ao carregar vídeos: {error}", "Couldn't load videos: {error}"],
  "video.empty": ["Nada na galeria ainda. Use \"Adicionar vídeo ou imagem\".", "Nothing in the gallery yet. Use \"Add video or picture\"."],
  "video.sending": ["Enviando {name} ({n}/{total})...", "Uploading {name} ({n}/{total})..."],
  "video.addFailed": ["Erro ao adicionar {name}: {error}", "Couldn't add {name}: {error}"],
  "video.added": ["Adicionado: {name}", "Added: {name}"],
  "video.addedMany": ["{count} vídeos adicionados", "{count} videos added"],
  "video.inUse": [
    "Esse é o vídeo em uso. Escolha e salve outro antes de remover.",
    "That's the video in use. Pick and save another one before removing it.",
  ],
  "video.confirmRemove": ["Remover \"{name}\" da galeria? O arquivo será apagado.", "Remove \"{name}\" from the gallery? The file will be deleted."],
  "video.removed": ["Removido: {name}", "Removed: {name}"],
  "video.removeFailed": ["Erro ao remover: {error}", "Couldn't remove it: {error}"],
  "time.min1": ["1 minuto", "1 minute"],
  "time.mins": ["{n} minutos", "{n} minutes"],
  "time.secs": ["{n} segundos", "{n} seconds"],

  "update.available": ["Nova versão {version} disponível", "New version {version} available"],
  "update.latest": ["Você está na versão mais recente", "You're on the latest version"],
  "update.failed": ["Não foi possível verificar atualizações", "Couldn't check for updates"],
  "update.check": ["Verificar atualizações", "Check for updates"],
  "save.reset": ["Restaurar padrões", "Restore defaults"],
  "save.save": ["Salvar alterações", "Save changes"],
  "save.pending": ["Alterações não salvas", "Unsaved changes"],
  "save.saved": ["Salvo!", "Saved!"],
  "save.error": ["Erro ao salvar", "Couldn't save"],
  "save.restored": ["Padrões restaurados", "Defaults restored"],
};

let current = "pt-BR";

/** "pt-BR" or "en". */
export function setLanguage(language) {
  current = language === "en" ? "en" : "pt-BR";
  document.documentElement.lang = current === "en" ? "en" : "pt-BR";
}

export function getLanguage() {
  return current;
}

/** Text for `key`, with `{name}` placeholders filled from `vars`. */
export function t(key, vars) {
  const entry = STRINGS[key];
  if (!entry) {
    console.warn("Missing string", key);
    return key;
  }
  const text = entry[current === "en" ? 1 : 0];
  return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? "")) : text;
}

/** Fills every element tagged with data-i18n* attributes. */
export function translatePage(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
}
