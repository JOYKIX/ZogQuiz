// Configuration unique des intros. Modifier les textes, durées, couleurs ou scènes ici
// suffit à mettre à jour toutes les pages intro-roundX.html.
window.INTRO_ROUNDS = {
  round1: {
    roundLabel: "Manche 1",
    title: "Le Sprint de Takumi",
    accentWord: "Sprint",
    subtitle: "Départ lancé, trajectoire parfaite, buzzer millimétré.",
    concept: "Une salve de questions anime/manga se joue à la vitesse pure. Comme dans une descente de montagne, il faut lire la trajectoire, freiner au bon moment et verrouiller le buzzer avant les autres sans sortir de route avec une mauvaise réponse.",
    duration: 36000,
    theme: { primary: "#09c8d7", secondary: "#ffd044", accent: "#ff6a00" },
    voice: { rate: 0.88, pitch: 0.92, volume: 1 },
    rules: ["Anticiper la question", "Buzzer proprement", "Répondre sans trembler"],
    scenes: [
      { text: "Manche 1. Le Sprint de Takumi. Le moteur monte dans les tours, les mains se posent sur le buzzer, et la moindre hésitation coûte la trajectoire.", voiceText: "Manche une. Le Sprint de Takumi. Le moteur monte dans les tours... les mains se posent sur le buzzer... et la moindre hésitation coûte la trajectoire.", subtitle: "Manche 1 · Le Sprint de Takumi", animation: "speedBurst", visual: "speed", token: "86", delay: 0 },
      { text: "Une question surgit. Il faut lire vite, comprendre encore plus vite, puis attaquer le buzzer avec précision.", voiceText: "Une question surgit. Il faut lire vite... comprendre encore plus vite... puis attaquer le buzzer avec précision.", subtitle: "Question visible. Décision instantanée.", animation: "buzzerHit", visual: "buzzer", delay: 5200 },
      { text: "Le premier buzz prend la main. Bonne réponse : le score grimpe. Mauvaise réponse : la course continue, et les autres reprennent l'aspiration.", voiceText: "Le premier buzz prend la main. Bonne réponse : le score grimpe. Mauvaise réponse : la course continue... et les autres reprennent l'aspiration.", subtitle: "Juste : +1. Faux : la main repart.", animation: "rulesReveal", visual: "rules", rules: ["Lire", "Buzzer", "Assumer"], delay: 12300 },
      { text: "La vitesse seule ne suffit pas. Le vrai pilote sait attendre le bon virage avant de déclencher.", voiceText: "La vitesse seule ne suffit pas. Le vrai pilote sait attendre le bon virage... avant de déclencher.", subtitle: "Rapide, oui. Mais parfaitement sûr.", animation: "lockSnap", visual: "lock", delay: 21500 },
      { text: "Participants, respirez. Le feu passe au vert. Le Sprint de Takumi commence maintenant.", voiceText: "Participants... respirez. Le feu passe au vert. Le Sprint de Takumi commence maintenant.", subtitle: "Feu vert. Plein gaz.", animation: "controlledFlash", visual: "speed", token: "GO", delay: 30200 }
    ]
  },
  round2: {
    roundLabel: "Manche 2",
    title: "L'Enquête de Conan",
    accentWord: "Conan",
    subtitle: "Un indice visuel, une œuvre, un lieu exact à démasquer.",
    concept: "Chaque image devient une scène de crime visuelle. Les joueurs analysent les détails, recoupent les indices, identifient l'œuvre, puis donnent le lieu demandé avec une précision de détective.",
    duration: 37000,
    theme: { primary: "#8d6bff", secondary: "#09c8d7", accent: "#ffd044" },
    voice: { rate: 0.86, pitch: 0.9, volume: 1 },
    rules: ["Observer sans se précipiter", "Relier les indices", "Nommer le lieu exact"],
    scenes: [
      { text: "Manche 2. L'Enquête de Conan. Une image arrive, silencieuse en apparence, mais chaque pixel peut dénoncer la vérité.", voiceText: "Manche deux. L'Enquête de Conan. Une image arrive... silencieuse en apparence... mais chaque pixel peut dénoncer la vérité.", subtitle: "Manche 2 · L'Enquête de Conan", animation: "clueScan", visual: "detective", token: "?", delay: 0 },
      { text: "Regardez les couleurs, l'architecture, les objets, l'ambiance. Le décor parle avant même que la réponse soit écrite.", voiceText: "Regardez les couleurs... l'architecture... les objets... l'ambiance. Le décor parle avant même que la réponse soit écrite.", subtitle: "Couleurs, décor, objets : tout compte.", animation: "imageFocus", visual: "imageFrame", cards: ["Indice", "Œuvre", "Lieu"], delay: 5600 },
      { text: "La réponse doit être précise. Pas une intuition vague : une œuvre reconnue, un lieu identifié, et un verdict clair.", voiceText: "La réponse doit être précise. Pas une intuition vague : une œuvre reconnue... un lieu identifié... et un verdict clair.", subtitle: "Réponse écrite. Verdict précis.", animation: "cardsSlide", visual: "answerFlow", cards: ["Œuvre", "Lieu", "Preuve"], delay: 13900 },
      { text: "Attention aux pièges. Un détail trop évident peut cacher l'indice qui change toute l'enquête.", voiceText: "Attention aux pièges. Un détail trop évident peut cacher l'indice... qui change toute l'enquête.", subtitle: "Le piège est souvent dans le détail.", animation: "rulesReveal", visual: "rules", rules: ["Scanner", "Déduire", "Accuser juste"], delay: 23400 },
      { text: "Détectives, ouvrez l'œil. L'Enquête de Conan démarre maintenant.", voiceText: "Détectives... ouvrez l'œil. L'Enquête de Conan démarre maintenant.", subtitle: "Indice en main. Enquête ouverte.", animation: "clueScan", visual: "detective", token: "GO", delay: 31400 }
    ]
  },
  round3: {
    roundLabel: "Manche 3",
    title: "L'examen de Koro-Sensei",
    accentWord: "Koro-Sensei",
    subtitle: "Un thème choisi, un chrono impitoyable, une classe sous pression.",
    concept: "Le joueur actif choisit un thème, puis passe au tableau pendant une rafale de questions. Le chrono impose le rythme : répondre, passer, rester lucide, et transformer la pression en points.",
    duration: 37000,
    theme: { primary: "#09c8d7", secondary: "#37f28b", accent: "#ffd044" },
    voice: { rate: 0.9, pitch: 0.95, volume: 1 },
    rules: ["Choisir un thème", "Gérer 90 secondes", "Répondre ou passer vite"],
    scenes: [
      { text: "Manche 3. L'examen de Koro-Sensei. La classe se tait, le tableau s'allume, et le chrono observe chaque élève.", voiceText: "Manche trois. L'examen de Koro-Sensei. La classe se tait... le tableau s'allume... et le chrono observe chaque élève.", subtitle: "Manche 3 · L'examen de Koro-Sensei", animation: "examStamp", visual: "exam", timer: "1:30", delay: 0 },
      { text: "Le joueur actif choisit son thème. C'est son chapitre, son terrain, mais aussi sa responsabilité.", voiceText: "Le joueur actif choisit son thème. C'est son chapitre... son terrain... mais aussi sa responsabilité.", subtitle: "Choix du thème : entrée au tableau.", animation: "cardsSlide", visual: "themeGrid", cards: ["Shonen", "Seinen", "OST"], delay: 5200 },
      { text: "Le chrono démarre à 90 secondes. Une bonne réponse avance la copie ; une passe rapide peut sauver la note.", voiceText: "Le chrono démarre à quatre-vingt-dix secondes. Une bonne réponse avance la copie... une passe rapide peut sauver la note.", subtitle: "90 secondes : scorer ou passer.", animation: "timerPulse", visual: "timer", timer: "1:30", delay: 13500 },
      { text: "Thème, question, timer : tout est visible. Ici, impossible de tricher avec le stress.", voiceText: "Thème... question... timer. Tout est visible. Ici, impossible de tricher avec le stress.", subtitle: "Tout est affiché. Tout se joue maintenant.", animation: "rulesReveal", visual: "rules", rules: ["Thème actif", "Question suivante", "Chrono visible"], delay: 22800 },
      { text: "Élèves, stylos prêts. L'examen de Koro-Sensei commence maintenant.", voiceText: "Élèves... stylos prêts. L'examen de Koro-Sensei commence maintenant.", subtitle: "Silence en classe. Chrono !", animation: "examStamp", visual: "exam", timer: "GO", delay: 31400 }
    ]
  },
  round4: {
    roundLabel: "Manche 4",
    title: "Les musiques de Kosei",
    accentWord: "Kosei",
    subtitle: "Opening, ending, OST : le moindre accord peut tout révéler.",
    concept: "Le son devient la question. Les participants écoutent un extrait, reconnaissent une œuvre, un titre ou un thème, puis répondent avant que la mélodie ne donne trop d'avance aux autres.",
    duration: 38000,
    theme: { primary: "#ffd044", secondary: "#09c8d7", accent: "#8d6bff" },
    voice: { rate: 0.84, pitch: 0.88, volume: 1 },
    rules: ["Écouter l'extrait", "Reconnaître la mélodie", "Répondre net"],
    scenes: [
      { text: "Manche 4. Les musiques de Kosei. La salle baisse d'un ton, le premier accord flotte, et les souvenirs remontent.", voiceText: "Manche quatre. Les musiques de Kosei. La salle baisse d'un ton... le premier accord flotte... et les souvenirs remontent.", subtitle: "Manche 4 · Les musiques de Kosei", animation: "pianoKeys", visual: "piano", token: "♪", delay: 0 },
      { text: "Opening, ending, OST ou thème de personnage : tout peut apparaître dans l'extrait.", voiceText: "Opening... ending... O S T... ou thème de personnage : tout peut apparaître dans l'extrait.", subtitle: "Opening, ending, OST : écoute totale.", animation: "soundWave", visual: "audio", token: "♪", delay: 5600 },
      { text: "Il faut reconnaître vite, mais répondre proprement. Le bon déclic doit devenir une réponse claire.", voiceText: "Il faut reconnaître vite... mais répondre proprement. Le bon déclic doit devenir une réponse claire.", subtitle: "Déclic rapide. Réponse claire.", animation: "rulesReveal", visual: "rules", rules: ["Silence", "Déclic", "Réponse"], delay: 14500 },
      { text: "L'admin lance, stoppe, puis révèle au moment parfait. Chaque seconde d'écoute peut redistribuer la manche.", voiceText: "L'admin lance... stoppe... puis révèle au moment parfait. Chaque seconde d'écoute peut redistribuer la manche.", subtitle: "Play. Stop. Reveal.", animation: "streamSweep", visual: "answerFlow", cards: ["PLAY", "BUZZ", "REVEAL"], delay: 24200 },
      { text: "Montez le volume. Les musiques de Kosei commencent maintenant.", voiceText: "Montez le volume. Les musiques de Kosei commencent maintenant.", subtitle: "Volume haut. Première note.", animation: "pianoKeys", visual: "piano", token: "PLAY", delay: 32300 }
    ]
  },
  round5: {
    roundLabel: "Manche 5",
    title: "Le grand terrassement",
    accentWord: "terrassement",
    subtitle: "PV, cibles, duels : le sol tremble sous chaque mauvaise réponse.",
    concept: "Les scores deviennent des points de vie. Le joueur actif choisit une cible, un duel s'ouvre au buzzer, et chaque bonne réponse inflige des dégâts. Les survivants avancent ; les autres tombent sous la pression.",
    duration: 38000,
    theme: { primary: "#ff3d57", secondary: "#ffd044", accent: "#8cf5dc" },
    voice: { rate: 0.82, pitch: 0.84, volume: 1 },
    rules: ["Choisir une cible", "Gagner le duel", "Survivre aux dégâts"],
    scenes: [
      { text: "Manche 5. Le grand terrassement. Les scores deviennent des points de vie, et le terrain commence à céder.", voiceText: "Manche cinq. Le grand terrassement. Les scores deviennent des points de vie... et le terrain commence à céder.", subtitle: "Manche 5 · Le grand terrassement", animation: "earthRumble", visual: "rumbling", token: "PV", delay: 0 },
      { text: "Chaque barre de vie compte. Un joueur solide peut devenir une cible, et une cible peut tomber en un duel.", voiceText: "Chaque barre de vie compte. Un joueur solide peut devenir une cible... et une cible peut tomber en un duel.", subtitle: "Les scores deviennent des PV.", animation: "hpDrain", visual: "hp", damage: "PV", delay: 5900 },
      { text: "À son tour, le joueur actif désigne quelqu'un. Le face-à-face s'ouvre, et le buzzer décide qui frappe.", voiceText: "À son tour, le joueur actif désigne quelqu'un. Le face-à-face s'ouvre... et le buzzer décide qui frappe.", subtitle: "Cible choisie. Duel ouvert.", animation: "duelClash", visual: "duel", delay: 15100 },
      { text: "Bonne réponse : la cible prend les dégâts. Si le duel échoue, les autres peuvent surgir et voler le coup.", voiceText: "Bonne réponse : la cible prend les dégâts. Si le duel échoue... les autres peuvent surgir et voler le coup.", subtitle: "Dégâts directs. Outsiders en embuscade.", animation: "rulesReveal", visual: "rules", rules: ["Cible", "Buzz", "Dégâts"], delay: 24800 },
      { text: "Restez debout. Le grand terrassement commence maintenant.", voiceText: "Restez debout. Le grand terrassement commence maintenant.", subtitle: "Le sol tremble. Survivez.", animation: "earthRumble", visual: "rumbling", token: "KO", delay: 32300 }
    ]
  },
  round6: {
    roundLabel: "Manche 6",
    title: "La guerre au sommet",
    accentWord: "sommet",
    subtitle: "Deux finalistes, deux chronos, une dernière bataille pour le trône.",
    concept: "La finale oppose le survivant de la manche précédente au meilleur viewer. Chacun défend son chrono, chaque question peut renverser le front, et le dernier point décide du vainqueur absolu.",
    duration: 39000,
    theme: { primary: "#ffd044", secondary: "#ff6a00", accent: "#09c8d7" },
    voice: { rate: 0.82, pitch: 0.82, volume: 1 },
    rules: ["Survivant contre top viewer", "Deux chronos", "Dernières questions décisives"],
    scenes: [
      { text: "Manche 6. La guerre au sommet. Tout ce qui précède mène ici : deux camps, une arène, un seul nom au-dessus des autres.", voiceText: "Manche six. La guerre au sommet. Tout ce qui précède mène ici : deux camps... une arène... un seul nom au-dessus des autres.", subtitle: "Manche 6 · La guerre au sommet", animation: "summitWar", visual: "summit", token: "VS", delay: 0 },
      { text: "D'un côté, le participant survivant. De l'autre, le meilleur viewer. Le public regarde le sommet se refermer.", voiceText: "D'un côté, le participant survivant. De l'autre, le meilleur viewer. Le public regarde le sommet se refermer.", subtitle: "Survivant contre top viewer.", animation: "duelClash", visual: "duel", delay: 5900 },
      { text: "Chaque camp possède son chrono. Quand le temps bascule, chaque réponse devient une attaque décisive.", voiceText: "Chaque camp possède son chrono. Quand le temps bascule... chaque réponse devient une attaque décisive.", subtitle: "Deux chronos. Aucun refuge.", animation: "timerPulse", visual: "timer", timer: "1:00", delay: 14800 },
      { text: "L'admin tire les questions, switche le temps, valide les réponses. Le front peut changer en une seconde.", voiceText: "L'admin tire les questions... switche le temps... valide les réponses. Le front peut changer en une seconde.", subtitle: "Question. Switch. Validation.", animation: "rulesReveal", visual: "rules", rules: ["Question tirée", "Switch chrono", "Vainqueur final"], delay: 25000 },
      { text: "Public, joueurs, viewers : dernière bataille. La guerre au sommet commence maintenant.", voiceText: "Public... joueurs... viewers : dernière bataille. La guerre au sommet commence maintenant.", subtitle: "Dernière bataille. À vous de jouer.", animation: "summitWar", visual: "summit", token: "GO", delay: 33500 }
    ]
  }
};
