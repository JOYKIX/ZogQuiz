// Configuration unique des intros. Modifier les textes, durées, couleurs ou scènes ici
// suffit à mettre à jour toutes les pages intro-roundX.html.
window.INTRO_ROUNDS = {
  round1: {
    roundLabel: "Manche 1",
    title: "Questions Cash",
    accentWord: "Cash",
    subtitle: "La base du quiz : question, buzzer, réponse nette.",
    concept: "Les participants répondent à des questions de culture anime/manga au buzzer. Le premier buzz verrouille la main : bonne réponse, point marqué ; mauvaise réponse, on relance proprement.",
    duration: 30000,
    theme: { primary: "#09c8d7", secondary: "#ffd044", accent: "#ff6a00" },
    rules: ["Buzzer en premier", "Réponse claire", "Point si c'est juste"],
    scenes: [
      { text: "Bienvenue dans la Manche 1 : Questions Cash.", subtitle: "Manche 1 : Questions Cash.", animation: "titleReveal", visual: "token", token: "Q?", delay: 0 },
      { text: "Une question apparaît, les joueurs lisent, et le premier buzzer prend la main.", subtitle: "Question à l'écran. Premier buzz = main prise.", animation: "buzzerHit", visual: "buzzer", delay: 4300 },
      { text: "L'admin valide ensuite : bonne réponse, le score monte ; mauvaise réponse, la question reste en jeu.", subtitle: "Juste : +1. Faux : la main tourne.", animation: "rulesReveal", visual: "rules", rules: ["Lire", "Buzzer", "Répondre"], delay: 9300 },
      { text: "La pression vient du verrouillage du buzzer : il faut être rapide, mais sûr de soi.", subtitle: "Rapide, oui. Mais sûr de sa réponse.", animation: "lockSnap", visual: "lock", delay: 15800 },
      { text: "Participants, mains sur le buzzer : la première salve démarre.", subtitle: "Mains sur le buzzer. Première salve !", animation: "streamSweep", visual: "spark", delay: 22500 }
    ]
  },
  round2: {
    roundLabel: "Manche 2",
    title: "Où est l'œuvre ?",
    accentWord: "œuvre",
    subtitle: "Une image, une œuvre, un lieu à retrouver.",
    concept: "Les joueurs observent une image liée à une œuvre et doivent identifier le lieu demandé. Les réponses écrites permettent de suivre qui a trouvé et dans quel ordre.",
    duration: 32000,
    theme: { primary: "#8d6bff", secondary: "#09c8d7", accent: "#ffd044" },
    rules: ["Observer l'image", "Reconnaître l'œuvre", "Trouver le lieu"],
    scenes: [
      { text: "Deuxième manche : Où est l'œuvre ?", subtitle: "Manche 2 : Où est l'œuvre ?", animation: "titleReveal", visual: "imageFrame", token: "IMG", delay: 0 },
      { text: "Une image est envoyée en live. Chaque détail peut donner l'œuvre et l'endroit à retrouver.", subtitle: "Une image live. Des détails à décoder.", animation: "imageFocus", visual: "imageFrame", cards: ["Image", "Œuvre", "Lieu"], delay: 4200 },
      { text: "Les participants répondent par écrit : il faut être précis, pas seulement rapide.", subtitle: "Réponse écrite : précision obligatoire.", animation: "cardsSlide", visual: "answerFlow", cards: ["Œuvre", "Lieu", "✓"], delay: 9800 },
      { text: "Si l'image paraît simple, attention : le piège est souvent dans le lieu exact.", subtitle: "Le piège : le lieu exact.", animation: "rulesReveal", visual: "rules", rules: ["Regarder", "Contextualiser", "Nommer juste"], delay: 17000 },
      { text: "Ouvrez l'œil : la chasse au lieu commence.", subtitle: "Ouvrez l'œil. La manche commence.", animation: "softZoom", visual: "token", token: "GO", delay: 24700 }
    ]
  },
  round3: {
    roundLabel: "Manche 3",
    title: "Thèmes Chrono",
    accentWord: "Chrono",
    subtitle: "Un thème choisi, une rafale de questions, 90 secondes au compteur.",
    concept: "Un joueur actif choisit un thème parmi la grille. Il enchaîne les questions pendant le chrono : passer, répondre juste et gérer le stress deviennent essentiels.",
    duration: 33000,
    theme: { primary: "#09c8d7", secondary: "#37f28b", accent: "#ffd044" },
    rules: ["Choisir un thème", "90 secondes", "Passer ou scorer"],
    scenes: [
      { text: "Troisième manche : Thèmes Chrono.", subtitle: "Manche 3 : Thèmes Chrono.", animation: "titleReveal", visual: "themeGrid", timer: "1:30", delay: 0 },
      { text: "La grille de thèmes s'ouvre : le joueur actif sélectionne son terrain de jeu.", subtitle: "Choix du thème : le terrain est posé.", animation: "cardsSlide", visual: "themeGrid", cards: ["Thème", "Joueur", "Go"], delay: 4200 },
      { text: "Le chrono démarre à 90 secondes. Chaque bonne réponse fait avancer, chaque passe sauve du temps.", subtitle: "90 secondes : scorer ou passer vite.", animation: "timerPulse", visual: "timer", timer: "1:30", delay: 9900 },
      { text: "L'overlay affiche le thème, la question et le timer : impossible de se cacher.", subtitle: "Thème, question, timer : tout est visible.", animation: "rulesReveal", visual: "rules", rules: ["Thème actif", "Question suivante", "Chrono visible"], delay: 17600 },
      { text: "Choisissez bien votre thème : le chrono n'attendra personne.", subtitle: "Choisissez. Respirez. Chrono !", animation: "controlledFlash", visual: "timer", timer: "GO", delay: 25500 }
    ]
  },
  round4: {
    roundLabel: "Manche 4",
    title: "Blind Test",
    accentWord: "Blind",
    subtitle: "Le son devient la question : opening, ending, OST ou personnage.",
    concept: "Les participants identifient une piste YouTube issue du blindtest. Le live gère lecture, pause, révélation et réponses : il faut reconnaître vite avant les autres.",
    duration: 34000,
    theme: { primary: "#ffd044", secondary: "#09c8d7", accent: "#8d6bff" },
    rules: ["Écouter l'extrait", "Identifier l'anime ou le titre", "Répondre vite"],
    scenes: [
      { text: "Quatrième manche : Blind Test.", subtitle: "Manche 4 : Blind Test.", animation: "titleReveal", visual: "audio", token: "♪", delay: 0 },
      { text: "Une piste se lance : opening, ending, OST ou thème personnage, tout peut tomber.", subtitle: "Opening, ending, OST : ouvrez les oreilles.", animation: "soundWave", visual: "audio", delay: 4500 },
      { text: "Les participants doivent reconnaître l'extrait et envoyer une réponse nette.", subtitle: "Déclic rapide. Réponse nette.", animation: "rulesReveal", visual: "rules", rules: ["Silence à l'écoute", "Déclic", "Réponse propre"], delay: 11200 },
      { text: "L'admin peut stopper sur réponse et révéler le titre quand le moment est venu.", subtitle: "Stop sur réponse, puis révélation.", animation: "streamSweep", visual: "answerFlow", cards: ["PLAY", "BUZZ", "REVEAL"], delay: 19600 },
      { text: "Montez le volume : le Blind Test commence.", subtitle: "Montez le volume. Blind Test !", animation: "softZoom", visual: "token", token: "PLAY", delay: 27300 }
    ]
  },
  round5: {
    roundLabel: "Manche 5",
    title: "Mort Subite",
    accentWord: "Subite",
    subtitle: "PV, cibles, duels : la moindre erreur peut éliminer.",
    concept: "Les scores deviennent des points de vie. Le joueur actif choisit une cible, un duel s'ouvre au buzzer, et les bonnes réponses infligent des dégâts jusqu'à désigner le survivant.",
    duration: 34000,
    theme: { primary: "#ff3d57", secondary: "#ffd044", accent: "#8cf5dc" },
    rules: ["Choisir une cible", "Buzzer en duel", "Infliger des dégâts"],
    scenes: [
      { text: "Cinquième manche : Mort Subite.", subtitle: "Manche 5 : Mort Subite.", animation: "titleReveal", visual: "hp", token: "PV", delay: 0 },
      { text: "Les scores se transforment en points de vie. Chaque joueur doit protéger sa barre.", subtitle: "Les scores deviennent des PV.", animation: "hpDrain", visual: "hp", delay: 4300 },
      { text: "À son tour, le joueur actif choisit une cible : le duel commence.", subtitle: "Joueur actif : choisissez votre cible.", animation: "duelClash", visual: "duel", delay: 10100 },
      { text: "Bonne réponse en duel : la cible prend les dégâts. Si personne ne trouve, les outsiders peuvent voler le coup.", subtitle: "Bonne réponse = dégâts. Outsiders en embuscade.", animation: "rulesReveal", visual: "rules", rules: ["Cible", "Buzz", "Dégâts"], delay: 18400 },
      { text: "Restez en vie : la Mort Subite démarre maintenant.", subtitle: "Survivez. La Mort Subite démarre.", animation: "controlledFlash", visual: "token", token: "KO", delay: 26500 }
    ]
  },
  round6: {
    roundLabel: "Manche 6",
    title: "Duel Final",
    accentWord: "Final",
    subtitle: "Participant survivant contre top viewer : deux chronos, une dernière bataille.",
    concept: "La finale oppose le survivant de la Mort Subite au meilleur viewer. Chacun dispose de son chrono ; les questions tirées de la banque font basculer le duel jusqu'au vainqueur final.",
    duration: 35000,
    theme: { primary: "#ffd044", secondary: "#ff6a00", accent: "#09c8d7" },
    rules: ["Survivant M5 vs viewer", "Deux chronos", "Questions décisives"],
    scenes: [
      { text: "Sixième manche : le Duel Final.", subtitle: "Manche 6 : Duel Final.", animation: "titleReveal", visual: "duel", token: "VS", delay: 0 },
      { text: "D'un côté, le participant survivant. De l'autre, le meilleur viewer du classement.", subtitle: "Survivant M5 contre top viewer.", animation: "duelClash", visual: "duel", delay: 4600 },
      { text: "Chaque camp a son chrono. Quand le temps tourne, chaque réponse devient critique.", subtitle: "Deux chronos. Chaque seconde compte.", animation: "timerPulse", visual: "timer", timer: "1:00", delay: 10800 },
      { text: "Les questions sortent de la banque : l'admin switche, valide, et le duel se tend.", subtitle: "Question, switch, validation : duel total.", animation: "rulesReveal", visual: "rules", rules: ["Question tirée", "Switch chrono", "Vainqueur final"], delay: 19200 },
      { text: "Public et joueurs, dernier round : que le Duel Final commence.", subtitle: "Dernier round. Duel Final !", animation: "controlledFlash", visual: "token", token: "GO", delay: 27600 }
    ]
  }
};
