const { useState, useEffect, useCallback } = React;

// ===== VERSION =====
const APP_VERSION = "2.3.1";

// ===== FIREBASE CONFIG =====
const FIREBASE_URL      = "https://conges-belgique-default-rtdb.europe-west1.firebasedatabase.app";
const FIREBASE_API_KEY  = "AIzaSyBphnA1yYQpGLd66yuReFK7dgwoIsgLwGE";
const getFirebaseUrl    = (path) => `${FIREBASE_URL}${path}.json?auth=${FIREBASE_API_KEY}`;

// ===== HELPERS FIREBASE =====
const generateId = (prefix = 'id') => {
  const ts   = Date.now().toString(36);
  const rand = Math.random().toString(36).substr(2, 8);
  return `${prefix}_${ts}_${rand}`;
};

const firebaseFetch = async (path, method = 'GET', body = null) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(getFirebaseUrl(path), opts);
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.stringify(await res.json()); } catch {}
    throw new Error(`Firebase ${res.status} [${method} ${path}] ${detail}`);
  }
  return res.json();
};

// ===== TYPES & COULEURS =====
const TYPES_CONFIG = {
  'Congé':        { color: 'bg-blue-100',   border: 'border-blue-400',   icon: '🏖️', text: 'text-blue-700'   },
  'Maladie':      { color: 'bg-orange-100', border: 'border-orange-400', icon: '🤒', text: 'text-orange-700' },
};
const getTypeConfig = (type) => {
  if (!type) return TYPES_CONFIG['Congé'];
  const t = type.toString().trim().toLowerCase();
  if (t.includes('maladie')) return TYPES_CONFIG['Maladie'];
  if (t.includes('partiel')) return { color: 'bg-yellow-100', border: 'border-yellow-400', icon: '⏰', text: 'text-yellow-700' };
  return TYPES_CONFIG['Congé'];
};

const TYPE_COLORS = {
  'Conge':        '#3b82f6',
  'Maladie':      '#f97316',
  'default':      '#6b7280',
};
const getTypeColor = (type) => {
  if (!type) return TYPE_COLORS['default'];
  const t = type.toString().trim().toLowerCase();
  if (t.includes('maladie')) return TYPE_COLORS['Maladie'];
  if (t.includes('partiel')) return '#eab308';
  return TYPE_COLORS['Conge'];
};


// ===== HELPER DATE LOCAL (évite le bug timezone de toISOString) =====
// toISOString() retourne UTC : en Belgique (UTC+2), minuit local = 22h UTC la veille
// → décalage d'un jour. On utilise getFullYear/Month/Date (heure locale) à la place.
const toLocalDateStr = (d) =>
  d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

// ===== JOURS =====
const JOURS_SEMAINE = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
];

// ===== ICÔNES SVG =====
const ChevronLeft  = () => React.createElement('svg', { width:24, height:24, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('polyline', { points:'15 18 9 12 15 6' }));
const ChevronRight = () => React.createElement('svg', { width:24, height:24, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('polyline', { points:'9 18 15 12 9 6' }));
const LogOut       = () => React.createElement('svg', { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('path', { d:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }), React.createElement('polyline', { points:'16 17 21 12 16 7' }), React.createElement('line', { x1:21, y1:12, x2:9, y2:12 }));
const Lock         = () => React.createElement('svg', { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('rect', { x:3, y:11, width:18, height:11, rx:2, ry:2 }), React.createElement('path', { d:'M7 11V7a5 5 0 0 1 10 0v4' }));

// ===== COMPOSANT DISQUE CAMEMBERT (Option C) =====
const describeArc = (cx, cy, r, startAngle, endAngle) => {
  const toRad = (deg) => (deg - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
};

/**
 * Disque camembert fixe (remplit la case).
 * Si tous les absents du jour ont une demi_journee identique (AM ou PM),
 * affiche un badge AM/PM en bas à droite (Option C).
 */
const PieDisc = ({ congesDuJour }) => {
  const total = congesDuJour.length;
  const cx = 50, cy = 50, r = 48;

  // Compter par type
  const counts = {};
  congesDuJour.forEach(c => {
    const key = c.type || 'Congé';
    counts[key] = (counts[key] || 0) + 1;
  });
  const types = Object.keys(counts);

  // Badge AM/PM : affiché si TOUS les absents du jour ont la même demi_journee (AM ou PM)
  const demiJournees = congesDuJour.map(c => c.demi_journee).filter(Boolean);
  const tousPareil   = demiJournees.length === total && new Set(demiJournees).size === 1;
  const badge        = tousPareil ? demiJournees[0] : null; // 'AM', 'PM', ou null

  const svgContent = [];

  if (types.length === 1) {
    svgContent.push(React.createElement('circle', { key:'c', cx, cy, r, fill: getTypeColor(types[0]) }));
  } else {
    let startAngle = 0;
    types.forEach((type, i) => {
      const slice    = (counts[type] / total) * 360;
      const endAngle = startAngle + (slice >= 360 ? 359.99 : slice);
      svgContent.push(React.createElement('path', { key:i, d: describeArc(cx, cy, r, startAngle, endAngle), fill: getTypeColor(type) }));
      startAngle += slice;
    });
  }

  // Chiffre blanc au centre
  svgContent.push(React.createElement('text', {
    key: 'txt', x: cx, y: cy,
    textAnchor: 'middle', dominantBaseline: 'central',
    fill: 'white', fontWeight: 'bold', fontSize: '34', fontFamily: 'sans-serif',
  }, total));

  // Badge AM/PM en surimpression SVG (coin bas-droite)
  if (badge) {
    svgContent.push(
      React.createElement('rect', { key:'badge-bg', x:62, y:68, width:34, height:20, rx:4, fill:'#1f2937' }),
      React.createElement('text', {
        key:'badge-txt', x:79, y:78,
        textAnchor:'middle', dominantBaseline:'central',
        fill:'white', fontWeight:'bold', fontSize:'13', fontFamily:'sans-serif',
      }, badge)
    );
  }

  return React.createElement('svg', {
    viewBox: '0 0 100 100',
    style: { display: 'block', width: '100%', height: '100%' },
  }, ...svgContent);
};

// ===== LOGIQUE CONGÉS PONCTUELS =====
const saveConge = async (conge) => {
  const { employe_id, dateDebut, dateFin, type, demi_journee } = conge;
  if (!employe_id || !dateDebut || !type) throw new Error('Champs obligatoires manquants');
  const debut   = new Date(dateDebut);
  const fin     = dateFin ? new Date(dateFin) : new Date(dateDebut);
  if (fin < debut) throw new Error('La date de fin doit être ≥ à la date de début');
  const nbJours = Math.round((fin - debut) / 86_400_000) + 1;
  const congeId = generateId('conge');
  const payload = {
    employe_id,
    dateDebut:  toLocalDateStr(debut),
    dateFin:    toLocalDateStr(fin),
    type, nbJours,
    createdAt:  new Date().toISOString(),
  };
  if (demi_journee) payload.demi_journee = demi_journee;
  await firebaseFetch(`/conges/${congeId}`, 'PUT', payload);
  return congeId;
};

// ===== LOGIQUE RÉCURRENCES =====
/**
 * Sauvegarde une règle de récurrence dans /recurrences/{id}.
 * pattern: 'weekly' | 'biweekly'
 * Pour 'weekly'   : jours = [1,3,5]
 * Pour 'biweekly' : joursP = [1,3] (semaines paires), joursI = [1,3,5] (impaires)
 * demi_journee: 'AM' | 'PM' | '' (journée entière)
 */
const saveRecurrence = async (rec, editId = null) => {
  const { employe_id, pattern, jours, joursP, joursI, dateDebut, dateFin, demi_journee } = rec;
  if (!employe_id || !dateDebut || !pattern) throw new Error('Champs obligatoires manquants');
  const id = editId || generateId('recur');
  const payload = {
    employe_id, pattern, dateDebut, dateFin: dateFin || '',
    demi_journee: demi_journee || '',
    createdAt: editId ? rec.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (pattern === 'weekly')   payload.jours  = jours  || [];
  if (pattern === 'biweekly') { payload.joursP = joursP || []; payload.joursI = joursI || []; }
  await firebaseFetch(`/recurrences/${id}`, 'PUT', payload);
  return id;
};

/**
 * Génère la liste des dates (strings YYYY-MM-DD) couvertes par une récurrence
 * pour un mois donné (année + mois 0-indexed).
 * Numérotation semaine ISO : lundi=1 … dimanche=0.
 */
const expandRecurrence = (rec, year, month) => {
  const results = [];
  const debut  = new Date(rec.dateDebut);
  const fin    = rec.dateFin ? new Date(rec.dateFin) : new Date(year, month + 3, 0); // défaut : +3 mois

  // Premier et dernier jour du mois demandé
  const moisDebut = new Date(year, month, 1);
  const moisFin   = new Date(year, month + 1, 0);
  const start     = debut > moisDebut ? debut : moisDebut;
  const end       = fin   < moisFin   ? fin   : moisFin;

  if (start > end) return results;

  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay(); // 0=dim, 1=lun … 6=sam

    if (rec.pattern === 'weekly') {
      if ((rec.jours || []).includes(dow)) {
        results.push({ date: toLocalDateStr(cur), demi_journee: rec.demi_journee || null });
      }
    } else if (rec.pattern === 'biweekly') {
      // Numéro de semaine ISO
      const thursday = new Date(cur);
      thursday.setDate(cur.getDate() + (4 - (cur.getDay() || 7)));
      const yearStart = new Date(thursday.getFullYear(), 0, 1);
      const weekNum   = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
      const isPaire   = weekNum % 2 === 0;
      const joursActifs = isPaire ? (rec.joursP || []) : (rec.joursI || []);
      if (joursActifs.includes(dow)) {
        results.push({ date: toLocalDateStr(cur), demi_journee: rec.demi_journee || null });
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return results;
};

// ===== NETTOYAGE AUTOMATIQUE (RH uniquement) =====
/**
 * Supprime de Firebase les congés ponctuels dont la dateFin est antérieure à M-2.
 * Les récurrences dont la dateFin est antérieure à M-2 sont aussi supprimées.
 */
const nettoyerAnciensConges = async () => {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - 2);
  limite.setDate(1);
  const limiteStr = toLocalDateStr(limite);

  try {
    // Congés ponctuels
    const congesData = await firebaseFetch('/conges').catch(() => null);
    if (congesData) {
      const suppressions = Object.entries(congesData)
        .filter(([, v]) => {
          const fin = v.dateFin || v.date || v.dateDebut || '';
          return fin && fin < limiteStr;
        })
        .map(([id]) => firebaseFetch(`/conges/${id}`, 'DELETE'));
      await Promise.all(suppressions);
      if (suppressions.length > 0) console.log(`🧹 Nettoyage : ${suppressions.length} congé(s) supprimé(s)`);
    }
    // Récurrences terminées
    const recurData = await firebaseFetch('/recurrences').catch(() => null);
    if (recurData) {
      const suppressionsR = Object.entries(recurData)
        .filter(([, v]) => v.dateFin && v.dateFin < limiteStr)
        .map(([id]) => firebaseFetch(`/recurrences/${id}`, 'DELETE'));
      await Promise.all(suppressionsR);
      if (suppressionsR.length > 0) console.log(`🧹 Nettoyage : ${suppressionsR.length} récurrence(s) supprimée(s)`);
    }
  } catch (err) {
    console.warn('Nettoyage partiel :', err.message);
  }
};

// ===== NORMALISATION DONNÉES =====
const expandCongeToJours = (conge) => {
  if (conge.dateDebut && conge.dateFin) {
    const jours = [];
    let cur = new Date(conge.dateDebut);
    const fin = new Date(conge.dateFin);
    while (cur <= fin) {
      jours.push({ ...conge, date: toLocalDateStr(cur) });
      cur.setDate(cur.getDate() + 1);
    }
    return jours;
  }
  if (conge.date) return [conge];
  return [];
};

// ===== COMPOSANT PRINCIPAL =====
// ===== FORMULAIRE RÉCURRENCE (composant autonome) =====
// Extrait de CongesApp pour éviter sa recréation à chaque render parent,
// ce qui causait la perte de focus sur les inputs date et select.
const FormulaireRecurrence = ({
  newRecur, setNewRecur, emptyRecur,
  editRecurId, setEditRecurId,
  setShowRecurForm, employes,
  ajouterRecurrence, saveError,
}) => {
  const toggleJour = (list, day) =>
    list.includes(day) ? list.filter(d => d !== day) : [...list, day];

  return React.createElement('div', { className:'bg-white rounded shadow p-6 space-y-4 border-l-4 border-yellow-400' },
    React.createElement('h2', { className:'font-bold text-lg flex items-center gap-2' },
      '⏰', editRecurId ? 'Modifier la récurrence' : '+ Nouvelle récurrence'
    ),

    saveError && React.createElement('div', { className:'bg-red-50 border border-red-300 text-red-700 rounded p-2 text-xs' }, saveError),

    React.createElement('div', null,
      React.createElement('label', { className:'block text-xs text-gray-500 mb-1' }, 'Collaborateur *'),
      React.createElement('select', {
        value: newRecur.employe_id, required: true,
        onChange: e => setNewRecur({ ...newRecur, employe_id: e.target.value }),
        className:'w-full px-3 py-2 border rounded text-sm'
      },
        React.createElement('option', { value:'' }, 'Sélectionner…'),
        employes.map(e => React.createElement('option', { key:e.id, value:e.id }, e.nom))
      )
    ),

    React.createElement('div', null,
      React.createElement('label', { className:'block text-xs text-gray-500 mb-1' }, 'Type de récurrence *'),
      React.createElement('select', {
        value: newRecur.pattern,
        onChange: e => setNewRecur({ ...newRecur, pattern: e.target.value }),
        className:'w-full px-3 py-2 border rounded text-sm'
      },
        React.createElement('option', { value:'weekly' },   'Toutes les semaines'),
        React.createElement('option', { value:'biweekly' }, 'Semaines paires / impaires')
      )
    ),

    newRecur.pattern === 'weekly' && React.createElement('div', null,
      React.createElement('label', { className:'block text-xs text-gray-500 mb-2' }, 'Jours actifs *'),
      React.createElement('div', { className:'flex flex-wrap gap-2' },
        JOURS_SEMAINE.map(j =>
          React.createElement('button', {
            key: j.value, type:'button',
            onClick: () => setNewRecur({ ...newRecur, jours: toggleJour(newRecur.jours, j.value) }),
            className: 'px-3 py-1 rounded text-sm font-medium border-2 transition ' + (
              newRecur.jours.includes(j.value)
                ? 'bg-yellow-400 border-yellow-500 text-white'
                : 'bg-white border-gray-300 text-gray-600'
            )
          }, j.label)
        )
      )
    ),

    newRecur.pattern === 'biweekly' && React.createElement('div', { className:'space-y-3' },
      React.createElement('div', null,
        React.createElement('label', { className:'block text-xs text-gray-500 mb-2' }, 'Semaines PAIRES'),
        React.createElement('div', { className:'flex flex-wrap gap-2' },
          JOURS_SEMAINE.map(j =>
            React.createElement('button', {
              key: j.value, type:'button',
              onClick: () => setNewRecur({ ...newRecur, joursP: toggleJour(newRecur.joursP, j.value) }),
              className: 'px-3 py-1 rounded text-sm font-medium border-2 transition ' + (
                newRecur.joursP.includes(j.value)
                  ? 'bg-blue-400 border-blue-500 text-white'
                  : 'bg-white border-gray-300 text-gray-600'
              )
            }, j.label)
          )
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { className:'block text-xs text-gray-500 mb-2' }, 'Semaines IMPAIRES'),
        React.createElement('div', { className:'flex flex-wrap gap-2' },
          JOURS_SEMAINE.map(j =>
            React.createElement('button', {
              key: j.value, type:'button',
              onClick: () => setNewRecur({ ...newRecur, joursI: toggleJour(newRecur.joursI, j.value) }),
              className: 'px-3 py-1 rounded text-sm font-medium border-2 transition ' + (
                newRecur.joursI.includes(j.value)
                  ? 'bg-purple-400 border-purple-500 text-white'
                  : 'bg-white border-gray-300 text-gray-600'
              )
            }, j.label)
          )
        )
      )
    ),

    React.createElement('div', null,
      React.createElement('label', { className:'block text-xs text-gray-500 mb-1' }, 'Demi-journée (optionnel)'),
      React.createElement('select', {
        value: newRecur.demi_journee,
        onChange: e => setNewRecur({ ...newRecur, demi_journee: e.target.value }),
        className:'w-full px-3 py-2 border rounded text-sm'
      },
        React.createElement('option', { value:'' }, 'Journée entière'),
        React.createElement('option', { value:'AM' }, '☀️ Matin seulement (AM)'),
        React.createElement('option', { value:'PM' }, '🌙 Après-midi seulement (PM)')
      )
    ),

    React.createElement('div', { className:'grid grid-cols-2 gap-3' },
      React.createElement('div', null,
        React.createElement('label', { className:'block text-xs text-gray-500 mb-1' }, 'Début *'),
        React.createElement('input', {
          type: 'date',
          value: newRecur.dateDebut,
          required: true,
          onChange: e => setNewRecur({ ...newRecur, dateDebut: e.target.value }),
          className:'w-full px-3 py-2 border rounded text-sm'
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { className:'block text-xs text-gray-500 mb-1' }, 'Fin (vide = indéfini)'),
        React.createElement('input', {
          type: 'date',
          value: newRecur.dateFin,
          min: newRecur.dateDebut,
          onChange: e => setNewRecur({ ...newRecur, dateFin: e.target.value }),
          className:'w-full px-3 py-2 border rounded text-sm'
        })
      )
    ),

    React.createElement('div', { className:'flex gap-2' },
      React.createElement('button', {
        type: 'button',
        onClick: ajouterRecurrence,
        disabled: !newRecur.employe_id || !newRecur.dateDebut,
        className:'flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white py-2 rounded font-medium transition'
      }, editRecurId ? 'Modifier' : 'Enregistrer'),
      React.createElement('button', {
        type: 'button',
        onClick: () => { setShowRecurForm(false); setNewRecur(emptyRecur); setEditRecurId(null); },
        className:'px-4 bg-gray-100 hover:bg-gray-200 rounded transition'
      }, 'Annuler')
    )
  );
};

const CongesApp = () => {
  const [currentUser,    setCurrentUser]    = useState(null);
  const [showRHLogin,    setShowRHLogin]    = useState(false);
  const [rhPassword,     setRhPassword]     = useState('');
  const [rhLoginError,   setRhLoginError]   = useState('');
  const [rhPage,         setRhPage]         = useState('congés');

  const [employes,     setEmployes]     = useState([]);
  const [conges,       setConges]       = useState([]);
  const [congesJours,  setCongesJours]  = useState([]);
  const [recurrences,  setRecurrences]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saveError,    setSaveError]    = useState('');
  const [undoStack,    setUndoStack]    = useState([]); // pile undo max 5

  const [newCollaborateur, setNewCollaborateur] = useState('');
  const [editingId,        setEditingId]        = useState(null);

  // Formulaire congé ponctuel
  const [newConge, setNewConge] = useState({ employe_id:'', dateDebut:'', dateFin:'', type:'Congé', demi_journee:'' });

  // Formulaire récurrence
  const emptyRecur = { employe_id:'', pattern:'weekly', jours:[], joursP:[], joursI:[], dateDebut:'', dateFin:'', demi_journee:'' };
  const [newRecur,      setNewRecur]      = useState(emptyRecur);
  const [editRecurId,   setEditRecurId]   = useState(null);
  const [showRecurForm, setShowRecurForm] = useState(false);

  const aujourd_hui = new Date();
  const [moisActuel,  setMoisActuel]  = useState(new Date(aujourd_hui.getFullYear(), aujourd_hui.getMonth(), 1));
  const [jourAffiche, setJourAffiche] = useState(aujourd_hui.getDate());

  // ── Chargement ────────────────────────────────────────────────────────────
  const chargerDonnees = useCallback(async () => {
    try {
      const [empData, conData, recData] = await Promise.all([
        firebaseFetch('/employes').catch(() => null),
        firebaseFetch('/conges').catch(() => null),
        firebaseFetch('/recurrences').catch(() => null),
      ]);

      const empList = empData
        ? Object.entries(empData).map(([key, value]) => ({ id: key, nom: typeof value === 'string' ? value : (value?.nom ?? key) }))
        : [];
      setEmployes(empList);

      const conList = conData
        ? Object.entries(conData).map(([key, value]) => ({ id: key, ...value }))
        : [];
      setConges(conList);
      setCongesJours(conList.flatMap(expandCongeToJours));

      const recList = recData
        ? Object.entries(recData).map(([key, value]) => ({ id: key, ...value }))
        : [];
      setRecurrences(recList);
    } catch (error) {
      console.error('Erreur Firebase:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerDonnees();
    const interval = setInterval(chargerDonnees, 2000);
    return () => clearInterval(interval);
  }, [chargerDonnees]);

  // ── Nettoyage au login RH ─────────────────────────────────────────────────
  const handleRHLogin = (e) => {
    e.preventDefault();
    if (rhPassword === 'encodageconge') {
      setCurrentUser({ type: 'RH' });
      setShowRHLogin(false);
      setRhPassword('');
      nettoyerAnciensConges().then(() => chargerDonnees());
    } else {
      setRhLoginError('Mot de passe incorrect');
    }
  };
  const handleLogout = () => { setCurrentUser(null); setRhPage('congés'); setShowRHLogin(false); };

  // ── Collaborateurs ─────────────────────────────────────────────────────────
  const ajouterCollaborateur = (e) => {
    e.preventDefault();
    if (!newCollaborateur.trim()) return;
    const newId  = editingId || `emp_${Date.now()}`;
    fetch(getFirebaseUrl(`/employes/${newId}`), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: newCollaborateur }),
    })
    .then(r => { if (!r.ok) throw new Error(`Firebase: ${r.status}`); return r.json(); })
    .then(() => { chargerDonnees(); setNewCollaborateur(''); setEditingId(null); alert('Enregistré ✓'); })
    .catch(err => alert('Erreur: ' + err.message));
  };
  const supprimerCollaborateur = (id) => {
    if (congesJours.some(c => c.employe_id === id) && !window.confirm('Ce collaborateur a des congés. Supprimer quand même ?')) return;
    fetch(getFirebaseUrl(`/employes/${id}`), { method: 'DELETE' }).then(() => chargerDonnees());
  };

  // ── Congés ponctuels ───────────────────────────────────────────────────────
  // ── Pile Undo (5 niveaux) ───────────────────────────────────────────────────
  const UNDO_MAX = 5;

  const pushUndo = (label) => {
    setUndoStack(prev => [
      { label, snapshot: [...conges] },
      ...prev.slice(0, UNDO_MAX - 1)
    ]);
  };

  const popUndo = async () => {
    if (undoStack.length === 0) return;
    const { snapshot } = undoStack[0];
    setSaveError('');
    try {
      const current = await firebaseFetch('/conges').catch(() => null);
      if (current) {
        await Promise.all(Object.keys(current).map(id => firebaseFetch(`/conges/${id}`, 'DELETE')));
      }
      await Promise.all(snapshot.map(c => {
        const { id, ...data } = c;
        return firebaseFetch(`/conges/${id}`, 'PUT', data);
      }));
      setUndoStack(prev => prev.slice(1));
      chargerDonnees();
    } catch (err) {
      setSaveError('Erreur annulation : ' + err.message);
    }
  };

    // ── Helpers chevauchement ───────────────────────────────────────────────────
  /**
   * Retourne la liste des dates (YYYY-MM-DD) comprises dans une plage.
   */
  const getDatesRange = (dateDebut, dateFin) => {
    const dates = [];
    const cur = new Date(dateDebut);
    const fin = new Date(dateFin || dateDebut);
    while (cur <= fin) {
      dates.push(toLocalDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  /**
   * Retourne les congés ponctuels (docs Firebase, pas jours éclatés)
   * d'un employé qui chevauchent une plage de dates.
   * filterType : si renseigné, ne garde que ce type.
   */
  const getChevauchements = (employe_id, dateDebut, dateFin, filterType = null) => {
    const plage = new Set(getDatesRange(dateDebut, dateFin));
    return conges.filter(c => {
      if (c.employe_id !== employe_id) return false;
      if (filterType && c.type !== filterType) return false;
      // Chevauchement si au moins un jour commun
      const joursConge = getDatesRange(c.dateDebut || c.date, c.dateFin || c.date);
      return joursConge.some(d => plage.has(d));
    });
  };

  /**
   * Retourne les règles de temps partiel (récurrences) d'un employé
   * qui produisent au moins un jour dans la plage.
   */
  const getRecurrencesChevauchement = (employe_id, dateDebut, dateFin) => {
    const plage = new Set(getDatesRange(dateDebut, dateFin));
    return recurrences.filter(rec => {
      if (rec.employe_id !== employe_id) return false;
      // Générer les jours de la récurrence sur la plage demandée
      const debut = new Date(dateDebut);
      const fin   = new Date(dateFin || dateDebut);
      const debutRec = new Date(rec.dateDebut);
      const finRec   = rec.dateFin ? new Date(rec.dateFin) : fin;
      const start = debut > debutRec ? debut : debutRec;
      const end   = fin   < finRec   ? fin   : finRec;
      if (start > end) return false;
      const days = expandRecurrence(rec,
        start.getFullYear(), start.getMonth()
      );
      // Si la plage couvre plusieurs mois, vérifier aussi les autres mois
      const months = new Set();
      const cur = new Date(start);
      while (cur <= end) {
        months.add(`${cur.getFullYear()}-${cur.getMonth()}`);
        cur.setMonth(cur.getMonth() + 1);
      }
      let allDays = [];
      months.forEach(m => {
        const [y, mo] = m.split('-').map(Number);
        allDays = allDays.concat(expandRecurrence(rec, y, mo));
      });
      return allDays.some(d => plage.has(d.date));
    });
  };

  // ── Ajout congé avec vérifications métier ────────────────────────────────────
  const ajouterConge = async (e) => {
    e.preventDefault();
    setSaveError('');

    const { employe_id, dateDebut, dateFin, type } = newConge;
    const emp = employes.find(e => e.id === employe_id);
    const nomEmp = emp?.nom ?? employe_id;
    const finEffective = dateFin || dateDebut;

    // ── Cas 1 : MALADIE → chercher chevauchements avec congés normaux ──────────
    if (type === 'Maladie') {
      const congesNormaux = getChevauchements(employe_id, dateDebut, finEffective, 'Congé');
      if (congesNormaux.length > 0) {
        const listing = congesNormaux.map(c =>
          `• ${c.dateDebut || c.date} → ${c.dateFin || c.date} (${c.nbJours || 1} jour(s))`
        ).join('
');
        const annuler = window.confirm(
          `⚠️ ${nomEmp} a déjà des congés sur cette période :

${listing}

` +
          `Voulez-vous ANNULER ces congés et les remplacer par la maladie ?

` +
          `OK = Annuler les congés et enregistrer la maladie
` +
          `Annuler = Garder les deux`
        );
        if (annuler) {
          pushUndo('Remplacement maladie — ' + nomEmp);
          try {
            await Promise.all(
              congesNormaux.map(c =>
                firebaseFetch(`/conges/${c.id}`, 'DELETE')
              )
            );
          } catch (err) {
            setSaveError('Erreur lors de la suppression des congés : ' + err.message);
            return;
          }
        }
        // Dans les deux cas on continue et on enregistre la maladie
      }
    }

    // ── Cas 2 : CONGÉ NORMAL → vérifier chevauchement avec temps partiel ──────
    if (type === 'Congé') {
      const recsChevauchants = getRecurrencesChevauchement(employe_id, dateDebut, finEffective);
      if (recsChevauchants.length > 0) {
        const listing = recsChevauchants.map(rec => {
          const jourLabels = (jours) =>
            (jours || []).map(d => JOURS_SEMAINE.find(j => j.value === d)?.label || d).join(', ');
          const pattern = rec.pattern === 'weekly'
            ? `Hebdo : ${jourLabels(rec.jours)}`
            : `Paires : ${jourLabels(rec.joursP)} | Impaires : ${jourLabels(rec.joursI)}`;
          return `• ${pattern} (du ${rec.dateDebut}${rec.dateFin ? ' au ' + rec.dateFin : ''})`;
        }).join('
');
        const continuer = window.confirm(
          `⚠️ ${nomEmp} a des jours de temps partiel sur cette période :

${listing}

` +
          `Voulez-vous quand même encoder ce congé par-dessus ?

` +
          `OK = Oui, encoder le congé
` +
          `Annuler = Non, abandonner`
        );
        if (!continuer) return; // Abandon
      }
    }

    // ── Enregistrement ─────────────────────────────────────────────────────────
    try {
      pushUndo('Ajout ' + newConge.type + ' — ' + (employes.find(e=>e.id===newConge.employe_id)?.nom ?? newConge.employe_id));
      await saveConge(newConge);
      chargerDonnees();
      setNewConge({ employe_id:'', dateDebut:'', dateFin:'', type:'Congé', demi_journee:'' });
      alert('Congé ajouté ✓');
    } catch (err) { setSaveError(err.message); alert('Erreur: ' + err.message); }
  };
  const supprimerConge = (id) => {
    const _cx = conges.find(x => x.id === id);
    const _ex = employes.find(e => e.id === _cx?.employe_id);
    pushUndo('Suppression — ' + (_ex?.nom ?? '?'));
    fetch(getFirebaseUrl(`/conges/${id}`), { method: 'DELETE' }).then(() => chargerDonnees());
  };

  // ── Récurrences ────────────────────────────────────────────────────────────
  const ajouterRecurrence = async () => {
    setSaveError('');
    try {
      await saveRecurrence(newRecur, editRecurId);
      chargerDonnees();
      setNewRecur(emptyRecur);
      setEditRecurId(null);
      setShowRecurForm(false);
      alert(editRecurId ? 'Récurrence modifiée ✓' : 'Récurrence ajoutée ✓');
    } catch (err) { setSaveError(err.message); alert('Erreur: ' + err.message); }
  };
  const supprimerRecurrence = (id) => {
    if (!window.confirm('Supprimer cette récurrence ?')) return;
    fetch(getFirebaseUrl(`/recurrences/${id}`), { method: 'DELETE' }).then(() => chargerDonnees());
  };
  const editerRecurrence = (rec) => {
    setNewRecur({ ...emptyRecur, ...rec });
    setEditRecurId(rec.id);
    setShowRecurForm(true);
  };

  // ── Helpers calendrier ─────────────────────────────────────────────────────
  const getDaysInMonth     = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1).getDay();

  // Jours générés par les récurrences pour le mois affiché
  const joursRecurrents = recurrences.flatMap(rec => {
    const days = expandRecurrence(rec, moisActuel.getFullYear(), moisActuel.getMonth());
    return days.map(d => ({
      ...d,
      employe_id: rec.employe_id,
      type: 'Temps partiel',
      demi_journee: d.demi_journee,
      isRecurrent: true,
    }));
  });

  // Fusion congés ponctuels + récurrents pour le calendrier
  const tousLesJours = [...congesJours, ...joursRecurrents];

  const isDateInConges = (day) => {
    const dateStr = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return tousLesJours.filter(c => c.date === dateStr);
  };

  const getAbsentsOfDay = (day) => {
    const dateStr = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return tousLesJours
      .filter(c => c.date === dateStr)
      .map(conge => {
        const employe = employes.find(e => e.id === conge.employe_id);
        if (!employe) return null;
        let dateDebut, dateFin;
        if (conge.isRecurrent) {
          dateDebut = dateStr; dateFin = dateStr;
        } else if (conge.dateDebut && conge.dateFin) {
          dateDebut = new Date(conge.dateDebut).toLocaleDateString('fr-BE');
          dateFin   = new Date(conge.dateFin).toLocaleDateString('fr-BE');
        } else {
          dateDebut = dateFin = dateStr;
        }
        return { employe, dateDebut, dateFin, type: conge.type, demi_journee: conge.demi_journee, isRecurrent: conge.isRecurrent };
      })
      .filter(Boolean);
  };

  const getAbsentsNames = (day) => getAbsentsOfDay(day).map(a => a.employe.nom).join('\n');
  const getTodayAbsents = () => {
    // Pour aujourd'hui, on recalcule avec le mois courant de aujourd_hui
    const d = aujourd_hui.getDate();
    const dateStr = `${aujourd_hui.getFullYear()}-${String(aujourd_hui.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return tousLesJours
      .filter(c => c.date === dateStr)
      .map(conge => {
        const employe = employes.find(e => e.id === conge.employe_id);
        if (!employe) return null;
        return { employe, type: conge.type, demi_journee: conge.demi_journee, isRecurrent: conge.isRecurrent };
      }).filter(Boolean);
  };

  const monthName = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return React.createElement('div', { className:'min-h-screen bg-gray-50 flex items-center justify-center' },
    React.createElement('p', null, `v${APP_VERSION} — Chargement…`)
  );

  if (showRHLogin) return React.createElement('div', { className:'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4' },
    React.createElement('div', { className:'bg-white rounded-lg shadow-2xl p-8 w-full max-w-md' },
      React.createElement('h1', { className:'text-3xl font-bold mb-8 text-center' }, 'Accès RH'),
      React.createElement('form', { onSubmit: handleRHLogin, className:'space-y-4' },
        React.createElement('input', { type:'password', value:rhPassword, onChange:e=>setRhPassword(e.target.value), className:'w-full px-4 py-2 border rounded-lg', placeholder:'Mot de passe', required:true }),
        rhLoginError && React.createElement('div', { className:'bg-red-50 text-red-700 px-4 py-3 rounded text-sm' }, rhLoginError),
        React.createElement('button', { type:'submit', className:'w-full bg-blue-600 text-white py-2 rounded-lg' }, 'Connexion'),
        React.createElement('button', { type:'button', onClick:()=>{ setShowRHLogin(false); setRhPassword(''); }, className:'w-full bg-gray-100 py-2 rounded-lg' }, 'Annuler'),
        React.createElement('p', { className:'text-xs text-gray-500 text-center mt-4' }, `v${APP_VERSION}`)
      )
    )
  );

  // ── Vue RH ─────────────────────────────────────────────────────────────────
  if (currentUser?.type === 'RH') return React.createElement('div', { className:'min-h-screen bg-red-50' },

    React.createElement('div', { className:'bg-white shadow-sm border-b' },
      React.createElement('div', { className:'max-w-7xl mx-auto px-6 py-4' },
        React.createElement('div', { className:'flex justify-between items-center mb-4' },
          React.createElement('div', null,
            React.createElement('h1', { className:'text-2xl font-bold' }, 'RH — Gestion des Congés'),
            React.createElement('p', { className:'text-sm text-gray-600' }, `${aujourd_hui.toLocaleDateString('fr-BE')} | v${APP_VERSION}`)
          ),
          React.createElement('div', { className:'flex items-center gap-3' },
            undoStack.length > 0 && React.createElement('div', { className:'flex items-center' },
              React.createElement('button', {
                onClick: popUndo,
                title: undoStack[0]?.label,
                className: 'flex items-center gap-2 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded-l-lg text-sm font-medium transition'
              },
                React.createElement('span', null, '↩'),
                React.createElement('span', { className:'max-w-48 truncate' }, undoStack[0]?.label)
              ),
              React.createElement('span', {
                className: 'px-2 py-2 bg-amber-200 text-amber-900 border border-l-0 border-amber-300 rounded-r-lg text-xs font-bold'
              }, undoStack.length + '/' + UNDO_MAX)
            ),
            React.createElement('button', { onClick:handleLogout, className:'px-4 py-2 bg-red-50 text-red-700 rounded-lg flex items-center gap-2' }, React.createElement(LogOut), 'Déco')
          )
        ),
        React.createElement('div', { className:'flex gap-2' },
          ['congés','temps partiel','collaborateurs'].map(page =>
            React.createElement('button', {
              key: page, onClick:()=>setRhPage(page),
              className:`px-5 py-3 border-b-2 capitalize text-sm font-medium ${rhPage===page ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500'}`
            }, page === 'temps partiel' ? '⏰ Temps partiel' : page === 'congés' ? '📋 Congés' : `👥 Collaborateurs (${employes.length})`)
          )
        )
      )
    ),

    React.createElement('div', { className:'max-w-7xl mx-auto px-6 py-8' },

      // ── Onglet Congés ────────────────────────────────────────────────────
      rhPage === 'congés' && React.createElement('div', { className:'grid grid-cols-3 gap-8' },
        React.createElement('div', { className:'col-span-1 space-y-4' },
          React.createElement('div', { className:'bg-white rounded shadow p-6 space-y-4' },
            React.createElement('h2', { className:'font-bold text-lg' }, '+ Absence ponctuelle'),
            saveError && React.createElement('div', { className:'bg-red-50 border border-red-300 text-red-700 rounded p-2 text-xs' }, saveError),
            React.createElement('select', {
              value:newConge.employe_id, onChange:e=>setNewConge({...newConge,employe_id:e.target.value}),
              className:'w-full px-3 py-2 border rounded text-sm'
            },
              React.createElement('option',{value:''},'Sélectionner…'),
              employes.map(e=>React.createElement('option',{key:e.id,value:e.id},e.nom))
            ),
            React.createElement('select', {
              value:newConge.type, onChange:e=>setNewConge({...newConge,type:e.target.value}),
              className:'w-full px-3 py-2 border rounded text-sm'
            },
              ['Congé','Maladie'].map(t=>React.createElement('option',{key:t,value:t},`${getTypeConfig(t).icon} ${t}`))
            ),
            React.createElement('select', {
              value:newConge.demi_journee, onChange:e=>setNewConge({...newConge,demi_journee:e.target.value}),
              className:'w-full px-3 py-2 border rounded text-sm'
            },
              React.createElement('option',{value:''},'Journée entière'),
              React.createElement('option',{value:'AM'},'☀️ Matin (AM)'),
              React.createElement('option',{value:'PM'},'🌙 Après-midi (PM)')
            ),
            React.createElement('div', null,
              React.createElement('label',{className:'block text-xs text-gray-500 mb-1'},'Date début *'),
              React.createElement('input',{type:'date',value:newConge.dateDebut,required:true,onChange:e=>setNewConge({...newConge,dateDebut:e.target.value}),className:'w-full px-3 py-2 border rounded text-sm'})
            ),
            React.createElement('div', null,
              React.createElement('label',{className:'block text-xs text-gray-500 mb-1'},'Date fin (vide = 1 jour)'),
              React.createElement('input',{type:'date',value:newConge.dateFin,min:newConge.dateDebut,onChange:e=>setNewConge({...newConge,dateFin:e.target.value}),className:'w-full px-3 py-2 border rounded text-sm'})
            ),
            React.createElement('button', {
              onClick:ajouterConge, disabled:!newConge.employe_id||!newConge.dateDebut,
              className:'w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded transition'
            }, 'Ajouter')
          )
        ),

        React.createElement('div', { className:'col-span-2 space-y-6' },
          React.createElement('div', { className:'grid grid-cols-2 gap-6' },
            React.createElement('div', { className:'bg-white rounded shadow p-6' },
              React.createElement('h3', { className:'font-bold text-lg mb-4' }, `Aujourd'hui`),
              getTodayAbsents().length===0
                ? React.createElement('p',{className:'text-gray-500 text-sm'},'Aucune absence')
                : getTodayAbsents().map((a,i)=>{
                    const cfg=getTypeConfig(a.type);
                    return React.createElement('div',{key:i,className:`flex gap-2 p-3 rounded mb-2 ${cfg.color}`},
                      React.createElement('span',null,cfg.icon),
                      React.createElement('div',null,
                        React.createElement('p',{className:'font-medium text-sm'},a.employe.nom),
                        React.createElement('p',{className:'text-xs text-gray-600'},
                          a.demi_journee ? `${a.type} (${a.demi_journee})` : a.type,
                          a.isRecurrent ? ' ⏰' : ''
                        )
                      )
                    );
                  })
            ),
            React.createElement('div', { className:'bg-white rounded shadow p-6' },
              React.createElement('h3', { className:'font-bold text-lg mb-4' }, 'Statistiques'),
              React.createElement('div', { className:'space-y-2 text-sm' },
                React.createElement('p', null, `👥 Collaborateurs : ${employes.length}`),
                React.createElement('p', null, `📋 Congés ponctuels : ${conges.length}`),
                React.createElement('p', null, `⏰ Temps partiels actifs : ${recurrences.length}`),
                React.createElement('p', null, `🏠 Absents aujourd'hui : ${getTodayAbsents().length}`)
              )
            )
          ),

          React.createElement('div', { className:'bg-white rounded shadow p-6' },
            React.createElement('h3', { className:'font-bold text-lg mb-4' }, 'Congés ponctuels enregistrés'),
            conges.length===0
              ? React.createElement('p',{className:'text-gray-500 text-sm'},'Aucun.')
              : React.createElement('table',{className:'w-full text-sm border-collapse'},
                  React.createElement('thead',null,
                    React.createElement('tr',{className:'bg-gray-50 text-gray-500 text-left'},
                      ['Collaborateur','Type','½J','Début','Fin','j',''].map((h,i)=>React.createElement('th',{key:i,className:'px-3 py-2'},h))
                    )
                  ),
                  React.createElement('tbody',null,
                    conges.slice().sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map(c=>{
                      const emp=employes.find(e=>e.id===c.employe_id);
                      const cfg=getTypeConfig(c.type);
                      return React.createElement('tr',{key:c.id,className:'border-t hover:bg-gray-50'},
                        React.createElement('td',{className:'px-3 py-2 font-medium'},emp?.nom??c.employe_id),
                        React.createElement('td',{className:'px-3 py-2'},
                          React.createElement('span',{className:`px-2 py-1 rounded text-xs ${cfg.color} ${cfg.text}`},`${cfg.icon} ${c.type}`)
                        ),
                        React.createElement('td',{className:'px-3 py-2 text-center'},c.demi_journee||'—'),
                        React.createElement('td',{className:'px-3 py-2'},c.dateDebut||c.date||'—'),
                        React.createElement('td',{className:'px-3 py-2'},c.dateFin||c.date||'—'),
                        React.createElement('td',{className:'px-3 py-2 text-center font-bold'},c.nbJours||1),
                        React.createElement('td',{className:'px-3 py-2'},
                          React.createElement('button',{
                            onClick:()=>{ if(window.confirm('Supprimer ?')) supprimerConge(c.id); },
                            className:'px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200'
                          },'✕')
                        )
                      );
                    })
                  )
                )
          )
        )
      ),

      // ── Onglet Récurrences ───────────────────────────────────────────────
      rhPage === 'temps partiel' && React.createElement('div', { className:'grid grid-cols-3 gap-8' },
        React.createElement('div', { className:'col-span-1' },
          showRecurForm
            ? React.createElement(FormulaireRecurrence, {
                newRecur, setNewRecur, emptyRecur,
                editRecurId, setEditRecurId,
                setShowRecurForm, employes,
                ajouterRecurrence, saveError,
              })
            : React.createElement('button', {
                onClick:()=>setShowRecurForm(true),
                className:'w-full bg-yellow-500 hover:bg-yellow-600 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2'
              }, '⏰ + Nouvelle récurrence')
        ),

        React.createElement('div', { className:'col-span-2' },
          React.createElement('div', { className:'bg-white rounded shadow p-6' },
            React.createElement('h3', { className:'font-bold text-lg mb-4' }, `Récurrences actives (${recurrences.length})`),
            recurrences.length===0
              ? React.createElement('p',{className:'text-gray-500 text-sm'},'Aucune récurrence configurée.')
              : React.createElement('div',{className:'space-y-3'},
                  recurrences.map(rec=>{
                    const emp=employes.find(e=>e.id===rec.employe_id);
                    const jourLabels = (jours) => (jours||[]).map(d=>JOURS_SEMAINE.find(j=>j.value===d)?.label||d).join(', ');
                    return React.createElement('div',{key:rec.id,className:'border rounded p-4 bg-yellow-50 border-yellow-200'},
                      React.createElement('div',{className:'flex justify-between items-start'},
                        React.createElement('div',null,
                          React.createElement('p',{className:'font-medium text-sm'},emp?.nom??rec.employe_id),
                          React.createElement('p',{className:'text-xs text-gray-600 mt-1'},
                            rec.pattern==='weekly'
                              ? `⏰ Hebdo : ${jourLabels(rec.jours)}`
                              : `⏰ Paires : ${jourLabels(rec.joursP)} | Impaires : ${jourLabels(rec.joursI)}`
                          ),
                          rec.demi_journee && React.createElement('p',{className:'text-xs text-gray-500'},
                            rec.demi_journee==='AM' ? '☀️ Matin seulement' : '🌙 Après-midi seulement'
                          ),
                          React.createElement('p',{className:'text-xs text-gray-400 mt-1'},
                            `Du ${rec.dateDebut}${rec.dateFin ? ` au ${rec.dateFin}` : ' (indéfini)'}`
                          )
                        ),
                        React.createElement('div',{className:'flex gap-2'},
                          React.createElement('button',{
                            onClick:()=>editerRecurrence(rec),
                            className:'px-3 py-1 bg-yellow-200 text-yellow-800 text-xs rounded hover:bg-yellow-300'
                          },'✏️'),
                          React.createElement('button',{
                            onClick:()=>supprimerRecurrence(rec.id),
                            className:'px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200'
                          },'✕')
                        )
                      )
                    );
                  })
                )
          )
        )
      ),

      // ── Onglet Collaborateurs ────────────────────────────────────────────
      rhPage === 'collaborateurs' && React.createElement('div', { className:'grid grid-cols-3 gap-8' },
        React.createElement('div', { className:'col-span-1' },
          React.createElement('div', { className:'bg-white rounded shadow p-6 space-y-4' },
            React.createElement('h2',{className:'font-bold text-lg'},editingId?'Modifier':'+ Ajouter'),
            React.createElement('input',{
              type:'text',value:newCollaborateur,
              onChange:e=>setNewCollaborateur(e.target.value),
              className:'w-full px-3 py-2 border rounded',placeholder:'Nom',required:true
            }),
            React.createElement('button',{onClick:ajouterCollaborateur,className:'w-full bg-blue-600 text-white py-2 rounded'},editingId?'Mettre à jour':'Ajouter'),
            editingId && React.createElement('button',{onClick:()=>{setEditingId(null);setNewCollaborateur('');},className:'w-full bg-gray-100 py-2 rounded text-sm'},'Annuler')
          )
        ),
        React.createElement('div', { className:'col-span-2' },
          React.createElement('div', { className:'bg-white rounded shadow p-6' },
            React.createElement('h2',{className:'font-bold text-lg mb-4'},`Collaborateurs (${employes.length})`),
            React.createElement('div',{className:'space-y-2'},
              employes.map(e=>{
                const nb=tousLesJours.filter(c=>c.employe_id===e.id).length;
                return React.createElement('div',{key:e.id,className:'flex justify-between p-3 bg-gray-50 rounded'},
                  React.createElement('div',null,
                    React.createElement('p',{className:'font-medium text-sm'},e.nom),
                    React.createElement('p',{className:'text-xs text-gray-600'},`${nb} jour(s) d'absence`)
                  ),
                  React.createElement('div',{className:'flex gap-2'},
                    React.createElement('button',{onClick:()=>{setNewCollaborateur(e.nom);setEditingId(e.id);},className:'px-2 py-1 bg-yellow-100 text-xs rounded'},'Modifier'),
                    React.createElement('button',{onClick:()=>supprimerCollaborateur(e.id),className:'px-2 py-1 bg-red-100 text-xs rounded'},'Supprimer')
                  )
                );
              })
            )
          )
        )
      )
    )
  );

  // ── Vue publique (calendrier) ──────────────────────────────────────────────
  return React.createElement('div', { className:'min-h-screen bg-gray-50' },
    React.createElement('div', { className:'bg-white shadow-sm border-b' },
      React.createElement('div', { className:'max-w-4xl mx-auto px-6 py-4 flex justify-between items-center' },
        React.createElement('div', null,
          React.createElement('h1',{className:'text-2xl font-bold'},'Calendrier des Congés'),
          React.createElement('p',{className:'text-sm text-gray-600'},aujourd_hui.toLocaleDateString('fr-BE'))
        ),
        React.createElement('div', { className:'flex items-center gap-4' },
          React.createElement('span',{className:'text-xs text-gray-500'},`v${APP_VERSION}`),
          React.createElement('button',{onClick:()=>setShowRHLogin(true),className:'px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2'},React.createElement(Lock),' RH')
        )
      )
    ),

    React.createElement('div', { className:'max-w-4xl mx-auto px-6 py-8' },

      // Légende
      React.createElement('div', { className:'flex gap-3 mb-4 flex-wrap' },
        Object.entries(TYPES_CONFIG).map(([type, cfg]) =>
          React.createElement('div', { key:type, className:`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.text}` },
            cfg.icon, ' ', type
          )
        ),
        React.createElement('div', { className:'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700' },
          '⏰ Temps partiel'
        )
      ),

      // Absents du jour sélectionné
      React.createElement('div', { className:'bg-white rounded shadow p-6 mb-6' },
        React.createElement('h2',{className:'font-bold mb-4'},
          `Absences du ${String(jourAffiche).padStart(2,'0')}/${String(moisActuel.getMonth()+1).padStart(2,'0')}/${moisActuel.getFullYear()}`
        ),
        getAbsentsOfDay(jourAffiche).length===0
          ? React.createElement('p',{className:'text-gray-500 text-sm'},'Aucune absence ce jour')
          : getAbsentsOfDay(jourAffiche).map((a,i)=>{
              const cfg=getTypeConfig(a.type);
              return React.createElement('div',{key:i,className:`flex gap-3 p-3 rounded border ${cfg.color} ${cfg.border} mb-2`},
                React.createElement('span',null,cfg.icon),
                React.createElement('div',null,
                  React.createElement('p',{className:'font-medium text-sm'},
                    a.employe.nom, a.isRecurrent ? ' ⏰' : ''
                  ),
                  React.createElement('p',{className:`text-xs ${cfg.text}`},
                    a.demi_journee
                      ? `${a.type} — ${a.demi_journee==='AM'?'☀️ Matin':'🌙 Après-midi'} : ${a.dateDebut} → ${a.dateFin}`
                      : `${a.type} : ${a.dateDebut} → ${a.dateFin}`
                  )
                )
              );
            })
      ),

      // Calendrier
      React.createElement('div', { className:'bg-white rounded shadow p-8' },
        React.createElement('div', { className:'flex justify-between items-center mb-6' },
          React.createElement('button',{onClick:()=>setMoisActuel(new Date(moisActuel.getFullYear(),moisActuel.getMonth()-1,1))},React.createElement(ChevronLeft)),
          React.createElement('h2',{className:'text-2xl font-bold text-center'},`${monthName[moisActuel.getMonth()]} ${moisActuel.getFullYear()}`),
          React.createElement('button',{onClick:()=>setMoisActuel(new Date(moisActuel.getFullYear(),moisActuel.getMonth()+1,1))},React.createElement(ChevronRight))
        ),
        React.createElement('div',{className:'grid grid-cols-7 gap-2 mb-4'},
          ['L','M','M','J','V','S','D'].map((d,i)=>React.createElement('div',{key:i,className:'text-center font-bold py-2 text-xs'},d))
        ),
        React.createElement('div',{className:'grid grid-cols-7 gap-2'},
          Array(getFirstDayOfMonth(moisActuel)===0?6:getFirstDayOfMonth(moisActuel)-1).fill(null).map((_,i)=>React.createElement('div',{key:`e${i}`})),
          Array(getDaysInMonth(moisActuel)).fill(null).map((_,i)=>{
            const day           = i+1;
            const congesDuJour  = isDateInConges(day);
            const isToday       = day===aujourd_hui.getDate() && moisActuel.getMonth()===aujourd_hui.getMonth() && moisActuel.getFullYear()===aujourd_hui.getFullYear();
            const dateFormatted = `${String(day).padStart(2,'0')}/${String(moisActuel.getMonth()+1).padStart(2,'0')}`;
            const absentsNames  = getAbsentsNames(day);

            return React.createElement('div',{
              key:day, onClick:()=>setJourAffiche(day),
              className:`aspect-square rounded border-2 flex flex-col cursor-pointer overflow-hidden ${
                isToday?'bg-green-100 border-green-400 ring-2 ring-green-300':'bg-gray-50 border-gray-200'
              }`,
              title: absentsNames,
            },
              React.createElement('span',{className:'text-xs font-bold text-gray-700 px-1 pt-1 shrink-0'},dateFormatted),
              congesDuJour.length>0
                ? React.createElement('div',{className:'flex-1 p-1 min-h-0'},React.createElement(PieDisc,{congesDuJour}))
                : React.createElement('div',{className:'flex-1'})
            );
          })
        )
      )
    )
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(CongesApp));
