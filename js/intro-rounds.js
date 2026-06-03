// Configuration unique des intros. Modifier les textes, durées, couleurs ou scènes ici
// suffit à mettre à jour toutes les pages intro-roundX.html.
window.INTRO_ROUNDS = {
  round1: {
    roundLabel: "Manche 1",
    title: "Sprint Quiz",
    accentWord: "Quiz",
    subtitle: "Une mise en jambes rapide pour lancer le show.",
    concept: "Les participants répondent vite, proprement, et commencent à construire leur score dès les premières questions.",
    duration: 30000,
    theme: { primary: "#09c8d7", secondary: "#ffd044", accent: "#ff6a00" },
    rules: ["Répondre avant les autres", "Valider la bonne réponse", "Chaque point compte"],
    scenes: [
      { text: "Bienvenue dans la première manche : le Sprint Quiz.", subtitle: "Bienvenue dans la Manche 1 : Sprint Quiz.", animation: "titleReveal", visual: "token", token: "01", delay: 0 },
      { text: "Le principe est simple : une question, une réponse, et il faut aller vite.", subtitle: "Une question. Une réponse. Il faut aller vite.", animation: "cardsSlide", visual: "cards", delay: 4300 },
      { text: "Les bonnes réponses rapportent des points, les hésitations peuvent coûter cher.", subtitle: "Bonne réponse = points. Hésitation = danger.", animation: "rulesReveal", visual: "rules", rules: ["Réactivité", "Précision", "Sang-froid"], delay: 9200 },
      { text: "Gardez le rythme : cette manche sert à prendre l'avantage dès le début.", subtitle: "Prenez l'avantage dès le début.", animation: "timerPulse", visual: "timer", timer: "GO", delay: 15600 },
      { text: "Public, participants, préparez-vous : le quiz démarre maintenant.", subtitle: "Prêts ? Le quiz démarre maintenant.", animation: "streamSweep", visual: "spark", delay: 22500 }
    ]
  },
  round2: {
    roundLabel: "Manche 2",
    title: "Face à Face",
    accentWord: "Face",
    subtitle: "Des duels lisibles, nerveux, et parfaits pour le stream.",
    concept: "Les joueurs s'affrontent sur des questions ciblées. Chaque duel peut faire basculer le classement.",
    duration: 32000,
    theme: { primary: "#8d6bff", secondary: "#09c8d7", accent: "#ffd044" },
    rules: ["Duel direct", "Réponse claire", "Avantage au plus solide"],
    scenes: [
      { text: "Deuxième manche : Face à Face.", subtitle: "Manche 2 : Face à Face.", animation: "titleReveal", visual: "token", token: "VS", delay: 0 },
      { text: "Ici, les participants entrent en duel. Il faut répondre juste sous pression.", subtitle: "Des duels. De la pression. Une réponse juste.", animation: "cardsSlide", visual: "cards", delay: 4200 },
      { text: "Chaque duel récompense la précision, mais aussi la capacité à garder son calme.", subtitle: "Précision + calme = avantage.", animation: "rulesReveal", visual: "rules", rules: ["Écouter la question", "Répondre clairement", "Tenir la pression"], delay: 9800 },
      { text: "Un duel gagné peut créer l'écart, un duel perdu peut relancer la partie.", subtitle: "Un duel peut tout relancer.", animation: "controlledFlash", visual: "spark", delay: 17000 },
      { text: "Que le meilleur gagne : le Face à Face peut commencer.", subtitle: "Le Face à Face peut commencer.", animation: "softZoom", visual: "token", token: "GO", delay: 24700 }
    ]
  },
  round3: {
    roundLabel: "Manche 3",
    title: "Contre-la-montre",
    accentWord: "montre",
    subtitle: "Le temps devient l'adversaire principal.",
    concept: "Une manche rythmée par un timer : les joueurs doivent gérer vitesse, mémoire et lucidité.",
    duration: 33000,
    theme: { primary: "#09c8d7", secondary: "#37f28b", accent: "#ffd044" },
    rules: ["Timer visible", "Décisions rapides", "Gestion du stress"],
    scenes: [
      { text: "Troisième manche : Contre-la-montre.", subtitle: "Manche 3 : Contre-la-montre.", animation: "titleReveal", visual: "timer", timer: "30", delay: 0 },
      { text: "Le timer est lancé, et chaque seconde compte.", subtitle: "Chaque seconde compte.", animation: "timerPulse", visual: "timer", timer: "15", delay: 4200 },
      { text: "Il faut répondre vite, mais rester lucide : une erreur peut faire perdre l'élan.", subtitle: "Vite, mais lucide.", animation: "rulesReveal", visual: "rules", rules: ["Lire vite", "Choisir juste", "Ne pas paniquer"], delay: 9800 },
      { text: "La pression monte pendant que le public suit le chrono.", subtitle: "Le chrono met la pression.", animation: "streamSweep", visual: "spark", delay: 17600 },
      { text: "Respirez un grand coup : le compte à rebours commence.", subtitle: "Le compte à rebours commence.", animation: "controlledFlash", visual: "timer", timer: "GO", delay: 25500 }
    ]
  },
  round4: {
    roundLabel: "Manche 4",
    title: "Choix Risqué",
    accentWord: "Risqué",
    subtitle: "Plus le choix est audacieux, plus la récompense peut être forte.",
    concept: "Les participants doivent arbitrer entre sécurité et prise de risque pour optimiser leurs points.",
    duration: 34000,
    theme: { primary: "#ff6a00", secondary: "#ffd044", accent: "#09c8d7" },
    rules: ["Choisir sa cible", "Assumer le risque", "Maximiser les points"],
    scenes: [
      { text: "Quatrième manche : Choix Risqué.", subtitle: "Manche 4 : Choix Risqué.", animation: "titleReveal", visual: "token", token: "?!", delay: 0 },
      { text: "Ici, chaque décision compte. Jouer prudent peut sécuriser, jouer fort peut rapporter gros.", subtitle: "Prudent pour sécuriser. Fort pour marquer gros.", animation: "cardsSlide", visual: "cards", delay: 4500 },
      { text: "Les participants doivent évaluer la question, leur confiance, et l'état du classement.", subtitle: "Évaluez confiance, question et classement.", animation: "rulesReveal", visual: "rules", rules: ["Confiance", "Lecture du score", "Audace maîtrisée"], delay: 11200 },
      { text: "Un bon choix peut créer un moment de stream mémorable.", subtitle: "Le bon choix peut tout changer.", animation: "controlledFlash", visual: "spark", delay: 19600 },
      { text: "C'est le moment de prendre ses responsabilités.", subtitle: "À vous de prendre le risque.", animation: "softZoom", visual: "token", token: "MAX", delay: 27300 }
    ]
  },
  round5: {
    roundLabel: "Manche 5",
    title: "Blind Test",
    accentWord: "Blind",
    subtitle: "Oreilles affûtées, réflexes prêts, le son devient la question.",
    concept: "Les participants identifient un extrait sonore ou musical. La vitesse et la culture font la différence.",
    duration: 33000,
    theme: { primary: "#ffd044", secondary: "#09c8d7", accent: "#8d6bff" },
    rules: ["Écouter l'extrait", "Identifier vite", "Répondre sans brouhaha"],
    scenes: [
      { text: "Cinquième manche : Blind Test.", subtitle: "Manche 5 : Blind Test.", animation: "titleReveal", visual: "token", token: "♪", delay: 0 },
      { text: "Cette fois, le son prend le contrôle. Il faut reconnaître l'extrait avant les autres.", subtitle: "Le son prend le contrôle.", animation: "streamSweep", visual: "spark", delay: 4300 },
      { text: "Écoutez bien le rythme, la voix, les instruments, ou le souvenir qui fait tilt.", subtitle: "Rythme, voix, instruments : cherchez le déclic.", animation: "rulesReveal", visual: "rules", rules: ["Silence à l'écoute", "Déclic rapide", "Réponse nette"], delay: 10100 },
      { text: "Le public peut vibrer avec vous, mais les participants doivent rester concentrés.", subtitle: "Ambiance forte, concentration maximale.", animation: "controlledFlash", visual: "cards", delay: 18400 },
      { text: "Montez le volume : le Blind Test peut commencer.", subtitle: "Montez le volume. Blind Test !", animation: "softZoom", visual: "token", token: "PLAY", delay: 25800 }
    ]
  },
  round6: {
    roundLabel: "Manche 6",
    title: "Finale",
    accentWord: "Finale",
    subtitle: "La dernière ligne droite : tension maximale, points décisifs.",
    concept: "La finale départage les meilleurs. Chaque réponse peut confirmer une avance ou créer un retournement.",
    duration: 35000,
    theme: { primary: "#ffd044", secondary: "#ff6a00", accent: "#09c8d7" },
    rules: ["Dernières questions", "Points décisifs", "Concentration totale"],
    scenes: [
      { text: "Sixième manche : la Finale.", subtitle: "Manche 6 : la Finale.", animation: "titleReveal", visual: "token", token: "FIN", delay: 0 },
      { text: "Tout ce qui s'est passé avant nous mène ici. Les écarts peuvent encore bouger.", subtitle: "Tout mène à ce moment.", animation: "softZoom", visual: "cards", delay: 4600 },
      { text: "Les meilleurs doivent rester solides : plus question de laisser filer des points.", subtitle: "Restez solides. Aucun point à laisser filer.", animation: "rulesReveal", visual: "rules", rules: ["Mental", "Mémoire", "Décision"], delay: 10800 },
      { text: "Le public suit chaque réponse, chaque hésitation, chaque retournement possible.", subtitle: "Chaque réponse peut créer un retournement.", animation: "streamSweep", visual: "spark", delay: 19200 },
      { text: "La finale peut commencer. Que le show se termine en beauté.", subtitle: "La Finale peut commencer.", animation: "controlledFlash", visual: "token", token: "GO", delay: 27600 }
    ]
  }
};
