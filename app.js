const { useState, useEffect, useCallback } = React;

// ===== VERSION =====
const APP_VERSION = "2.1.0";

// ===== FIREBASE CONFIG =====
// Vos paramètres d'origine — inchangés
const FIREBASE_URL = "https://conges-belgique-default-rtdb.europe-west1.firebasedatabase.app";
const FIREBASE_API_KEY = "AIzaSyBphnA1yYQpGLd66yuReFK7dgwoIsgLwGE";

// ===== HELPERS FIREBASE =====

/**
 * Construit l'URL Firebase avec auth.
 * Identique à l'original — conservé tel quel.
 */
const getFirebaseUrl = (path) => `${FIREBASE_URL}${path}.json?auth=${FIREBASE_API_KEY}`;

/**
 * Génère un ID sans point ni caractère interdit par Firebase (. # $ [ ]).
 *
 * CORRECTION BUG v2.0.0 :
 *   Math.random() produisait "conge_1714123456789_0.7234…"
 *   Le point dans l'ID est interdit par Firebase → erreur 400 sur CHAQUE PUT.
 *   toString(36) encode en base-36 (chiffres + lettres a-z) : jamais de point.
 */
const generateId = (prefix = 'id') => {
  const ts   = Date.now().toString(36);
  const rand = Math.random().toString(36).substr(2, 8);
  return `${prefix}_${ts}_${rand}`;
};

/**
 * Wrapper fetch unifié :
 *   - Ajoute Content-Type: application/json (absent dans v2.0.0)
 *   - Lit le body d'erreur Firebase pour un message clair
 */
const firebaseFetch = async (path, method = 'GET', body = null) => {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
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
// Identiques à l'original Haiku
const TYPES_CONFIG = {
  'Congé':       { color: 'bg-blue-100',   border: 'border-blue-400',   icon: '🏖️', text: 'text-blue-700'   },
  'Maladie':     { color: 'bg-orange-100', border: 'border-orange-400', icon: '🤒', text: 'text-orange-700' },
  'Temps partiel':{ color: 'bg-yellow-100', border: 'border-yellow-400', icon: '⏰', text: 'text-yellow-700' },
};

const getTypeConfig = (type) => {
  if (!type) return TYPES_CONFIG['Congé'];
  const t = type.toString().trim();
  if (t.toLowerCase().includes('maladie')) return TYPES_CONFIG['Maladie'];
  if (t.toLowerCase().includes('partiel')) return TYPES_CONFIG['Temps partiel'];
  return TYPES_CONFIG['Congé'];
};

// ===== ICÔNES SVG (identiques à l'original) =====
const ChevronLeft  = () => React.createElement('svg', { width:24, height:24, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('polyline', { points:'15 18 9 12 15 6' }));
const ChevronRight = () => React.createElement('svg', { width:24, height:24, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('polyline', { points:'9 18 15 12 9 6' }));
const LogOut       = () => React.createElement('svg', { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('path', { d:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }), React.createElement('polyline', { points:'16 17 21 12 16 7' }), React.createElement('line', { x1:21, y1:12, x2:9, y2:12 }));
const Lock         = () => React.createElement('svg', { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2 }, React.createElement('rect', { x:3, y:11, width:18, height:11, rx:2, ry:2 }), React.createElement('path', { d:'M7 11V7a5 5 0 0 1 10 0v4' }));

// ===== LOGIQUE CONGÉS =====

/**
 * NOUVEAU en v2.1.0 :
 *   Stocke UN seul document Firebase par congé (plage dateDebut→dateFin).
 *   Structure : { employe_id, dateDebut, dateFin, type, nbJours, createdAt }
 *
 *   Avantages :
 *     • 1 seule requête au lieu de N (1 par jour) → plus aucun problème Promise.all
 *     • Pas d'ID avec point → plus d'erreur 400
 *     • Calculs légaux (jours fériés belges) centralisables côté lecture
 */
const saveConge = async (conge) => {
  const { employe_id, dateDebut, dateFin, type } = conge;
  if (!employe_id || !dateDebut || !type) {
    throw new Error('Champs obligatoires manquants : collaborateur, date début, type');
  }
  const debut = new Date(dateDebut);
  const fin   = dateFin ? new Date(dateFin) : new Date(dateDebut);
  if (fin < debut) throw new Error('La date de fin doit être ≥ à la date de début');

  const nbJours = Math.round((fin - debut) / 86_400_000) + 1;
  const congeId = generateId('conge');   // ← plus jamais de point dans l'ID

  await firebaseFetch(`/conges/${congeId}`, 'PUT', {
    employe_id,
    dateDebut:  debut.toISOString().split('T')[0],
    dateFin:    fin.toISOString().split('T')[0],
    type,
    nbJours,
    createdAt:  new Date().toISOString(),
  });
  return congeId;
};

/**
 * Normalise un congé Firebase vers un tableau de jours individuels
 * pour alimenter la vue calendrier — identique à l'original.
 *
 * Rétrocompatible :
 *   • Ancien format v2.0.0 : { date, employe_id, type }          → 1 jour
 *   • Nouveau format v2.1.0 : { dateDebut, dateFin, employe_id } → N jours
 */
const expandCongeToJours = (conge) => {
  // Nouveau format : plage
  if (conge.dateDebut && conge.dateFin) {
    const jours = [];
    let cur = new Date(conge.dateDebut);
    const fin = new Date(conge.dateFin);
    while (cur <= fin) {
      jours.push({
        ...conge,
        date: cur.toISOString().split('T')[0],
      });
      cur.setDate(cur.getDate() + 1);
    }
    return jours;
  }
  // Ancien format : jour unique (rétrocompatibilité)
  if (conge.date) return [conge];
  return [];
};

// ===== COMPOSANT PRINCIPAL =====
const CongesApp = () => {
  const [currentUser,    setCurrentUser]    = useState(null);
  const [showRHLogin,    setShowRHLogin]    = useState(false);
  const [rhPassword,     setRhPassword]     = useState('');
  const [rhLoginError,   setRhLoginError]   = useState('');
  const [rhPage,         setRhPage]         = useState('congés');

  const [employes,  setEmployes]  = useState([]);
  const [conges,    setConges]    = useState([]);   // documents Firebase bruts
  const [congesJours, setCongesJours] = useState([]); // vue éclatée par jour
  const [loading,   setLoading]   = useState(true);
  const [saveError, setSaveError] = useState('');

  const [newCollaborateur, setNewCollaborateur] = useState('');
  const [editingId,        setEditingId]        = useState(null);
  const [newConge, setNewConge] = useState({ employe_id:'', dateDebut:'', dateFin:'', type:'Congé' });

  const aujourd_hui = new Date();
  const [moisActuel,  setMoisActuel]  = useState(new Date(aujourd_hui.getFullYear(), aujourd_hui.getMonth(), 1));
  const [jourAffiche, setJourAffiche] = useState(aujourd_hui.getDate());

  // ── Chargement Firebase ────────────────────────────────────────────────────
  const chargerDonnees = useCallback(async () => {
    try {
      const [empData, conData] = await Promise.all([
        firebaseFetch('/employes').catch(() => null),
        firebaseFetch('/conges').catch(() => null),
      ]);

      if (empData) {
        setEmployes(Object.entries(empData).map(([key, value]) => ({
          id:  key,
          nom: typeof value === 'string' ? value : (value?.nom ?? key),
        })));
      } else {
        setEmployes([]);
      }

      if (conData) {
        const docs = Object.entries(conData).map(([key, value]) => ({ id: key, ...value }));
        setConges(docs);
        // Éclatement en jours pour la vue calendrier (rétrocompat ancien + nouveau format)
        setCongesJours(docs.flatMap(expandCongeToJours));
      } else {
        setConges([]);
        setCongesJours([]);
      }
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

  // ── Collaborateurs ─────────────────────────────────────────────────────────
  // Identique à l'original — les collaborateurs n'avaient pas de bug
  const ajouterCollaborateur = (e) => {
    e.preventDefault();
    if (!newCollaborateur.trim()) return;
    const newId  = editingId || `emp_${Date.now()}`;
    const newEmp = { nom: newCollaborateur };
    fetch(getFirebaseUrl(`/employes/${newId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(newEmp),
    })
    .then(resp => { if (!resp.ok) throw new Error(`Firebase: ${resp.status}`); return resp.json(); })
    .then(() => { chargerDonnees(); setNewCollaborateur(''); setEditingId(null); alert('Enregistré ✓'); })
    .catch(err => { console.error(err); alert('Erreur: ' + err.message); });
  };

  const supprimerCollaborateur = (id) => {
    if (congesJours.some(c => c.employe_id === id) && !window.confirm('Ce collaborateur a des congés enregistrés. Supprimer quand même ?')) return;
    fetch(getFirebaseUrl(`/employes/${id}`), { method: 'DELETE' })
    .then(() => chargerDonnees());
  };

  // ── Congés ─────────────────────────────────────────────────────────────────
  const ajouterConge = async (e) => {
    e.preventDefault();
    setSaveError('');
    try {
      await saveConge(newConge);
      chargerDonnees();
      setNewConge({ employe_id:'', dateDebut:'', dateFin:'', type:'Congé' });
      alert('Congé ajouté ✓');
    } catch (err) {
      console.error('Erreur ajout congé:', err);
      setSaveError(err.message);
      alert('Erreur: ' + err.message);
    }
  };

  const supprimerConge = (id) => {
    fetch(getFirebaseUrl(`/conges/${id}`), { method: 'DELETE' })
    .then(() => chargerDonnees());
  };

  // ── Authentification RH ────────────────────────────────────────────────────
  // Identique à l'original
  const handleRHLogin = (e) => {
    e.preventDefault();
    if (rhPassword === 'encodageconge') {
      setCurrentUser({ type: 'RH' });
      setShowRHLogin(false);
      setRhPassword('');
    } else {
      setRhLoginError('Mot de passe incorrect');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setRhPage('congés');
    setShowRHLogin(false);
  };

  // ── Helpers calendrier ─────────────────────────────────────────────────────
  // Identiques à l'original — utilisent désormais congesJours (vue éclatée)
  const getDaysInMonth    = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const isDateInConges = (day) => {
    const dateStr = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return congesJours.filter(c => c.date === dateStr);
  };

  const getAbsentsOfDay = (day) => {
    const dateStr = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth() + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return congesJours
      .filter(c => c.date === dateStr)
      .map(conge => {
        const employe = employes.find(e => e.id === conge.employe_id);
        if (!employe) return null;

        // Période : pour les nouveaux congés on l'a directement,
        // pour les anciens on recalcule comme dans l'original
        let dateDebut, dateFin;
        if (conge.dateDebut && conge.dateFin) {
          dateDebut = new Date(conge.dateDebut).toLocaleDateString('fr-BE');
          dateFin   = new Date(conge.dateFin).toLocaleDateString('fr-BE');
        } else {
          const allCongesForEmployee = congesJours
            .filter(c => c.employe_id === conge.employe_id)
            .map(c => new Date(c.date))
            .sort((a, b) => a - b);

          const targetDate = new Date(dateStr);
          let periodDebut = null, periodFin = null;
          for (let i = 0; i < allCongesForEmployee.length; i++) {
            if (allCongesForEmployee[i].toDateString() === targetDate.toDateString()) {
              periodDebut = allCongesForEmployee[i];
              let j = i;
              while (j < allCongesForEmployee.length - 1) {
                if (Math.floor((allCongesForEmployee[j+1] - allCongesForEmployee[j]) / 86400000) > 1) {
                  periodFin = allCongesForEmployee[j];
                  break;
                }
                j++;
              }
              if (!periodFin) periodFin = allCongesForEmployee[allCongesForEmployee.length - 1];
              break;
            }
          }
          dateDebut = periodDebut ? periodDebut.toLocaleDateString('fr-BE') : dateStr;
          dateFin   = periodFin   ? periodFin.toLocaleDateString('fr-BE')   : dateStr;
        }

        return { employe, dateDebut, dateFin, type: conge.type };
      })
      .filter(Boolean);
  };

  const getAbsentsNames = (day) => getAbsentsOfDay(day).map(a => a.employe.nom).join('\n');
  const getTodayAbsents = () => getAbsentsOfDay(aujourd_hui.getDate());

  const monthName = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  // ── Render : chargement ────────────────────────────────────────────────────
  if (loading) return React.createElement('div', { className:'min-h-screen bg-gray-50 flex items-center justify-center' },
    React.createElement('p', null, `v${APP_VERSION} — Chargement…`)
  );

  // ── Render : login RH ──────────────────────────────────────────────────────
  if (showRHLogin) {
    return React.createElement('div', { className:'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4' },
      React.createElement('div', { className:'bg-white rounded-lg shadow-2xl p-8 w-full max-w-md' },
        React.createElement('h1', { className:'text-3xl font-bold mb-8 text-center' }, 'Accès RH'),
        React.createElement('form', { onSubmit: handleRHLogin, className:'space-y-4' },
          React.createElement('input', { type:'password', value:rhPassword, onChange:(e)=>setRhPassword(e.target.value), className:'w-full px-4 py-2 border rounded-lg', placeholder:'Mot de passe', required:true }),
          rhLoginError && React.createElement('div', { className:'bg-red-50 text-red-700 px-4 py-3 rounded text-sm' }, rhLoginError),
          React.createElement('button', { type:'submit', className:'w-full bg-blue-600 text-white py-2 rounded-lg' }, 'Connexion'),
          React.createElement('button', { type:'button', onClick:()=>{ setShowRHLogin(false); setRhPassword(''); }, className:'w-full bg-gray-100 py-2 rounded-lg' }, 'Annuler'),
          React.createElement('p', { className:'text-xs text-gray-500 text-center mt-4' }, `v${APP_VERSION}`)
        )
      )
    );
  }

  // ── Render : vue RH ────────────────────────────────────────────────────────
  if (currentUser?.type === 'RH') {
    return React.createElement('div', { className:'min-h-screen bg-red-50' },

      // Header RH
      React.createElement('div', { className:'bg-white shadow-sm border-b' },
        React.createElement('div', { className:'max-w-7xl mx-auto px-6 py-4' },
          React.createElement('div', { className:'flex justify-between items-center mb-4' },
            React.createElement('div', null,
              React.createElement('h1', { className:'text-2xl font-bold' }, 'RH — Gestion des Congés'),
              React.createElement('p', { className:'text-sm text-gray-600' }, `${aujourd_hui.toLocaleDateString('fr-BE')} | v${APP_VERSION}`)
            ),
            React.createElement('button', { onClick: handleLogout, className:'px-4 py-2 bg-red-50 text-red-700 rounded-lg flex items-center gap-2' },
              React.createElement(LogOut), 'Déco'
            )
          ),
          React.createElement('div', { className:'flex gap-2' },
            React.createElement('button', { onClick:()=>setRhPage('congés'),         className:`px-6 py-3 border-b-2 ${rhPage==='congés'         ? 'border-red-600 text-red-600' : 'border-transparent'}` }, 'Congés'),
            React.createElement('button', { onClick:()=>setRhPage('collaborateurs'), className:`px-6 py-3 border-b-2 ${rhPage==='collaborateurs' ? 'border-red-600 text-red-600' : 'border-transparent'}` }, `Collaborateurs (${employes.length})`)
          )
        )
      ),

      // Contenu RH
      React.createElement('div', { className:'max-w-7xl mx-auto px-6 py-8' },

        rhPage === 'congés'
          // ── Onglet Congés ──────────────────────────────────────────────────
          ? React.createElement('div', { className:'grid grid-cols-3 gap-8' },

            // Formulaire ajout congé
            React.createElement('div', { className:'col-span-1' },
              React.createElement('div', { className:'bg-white rounded shadow p-6 space-y-4' },
                React.createElement('h2', { className:'font-bold text-lg' }, '+ Absence'),

                saveError && React.createElement('div', { className:'bg-red-50 border border-red-300 text-red-700 rounded p-2 text-xs' }, saveError),

                React.createElement('select', {
                  value: newConge.employe_id,
                  onChange: (e) => setNewConge({ ...newConge, employe_id: e.target.value }),
                  className:'w-full px-3 py-2 border rounded'
                },
                  React.createElement('option', { value:'' }, 'Sélectionner…'),
                  employes.map(e => React.createElement('option', { key:e.id, value:e.id }, e.nom))
                ),

                React.createElement('select', {
                  value: newConge.type,
                  onChange: (e) => setNewConge({ ...newConge, type: e.target.value }),
                  className:'w-full px-3 py-2 border rounded'
                },
                  ['Congé','Maladie','Temps partiel'].map(t =>
                    React.createElement('option', { key:t, value:t }, `${getTypeConfig(t).icon} ${t}`)
                  )
                ),

                React.createElement('div', null,
                  React.createElement('label', { className:'block text-xs text-gray-500 mb-1' }, 'Date début *'),
                  React.createElement('input', {
                    type:'date', value:newConge.dateDebut, required:true,
                    onChange:(e)=>setNewConge({ ...newConge, dateDebut:e.target.value }),
                    className:'w-full px-3 py-2 border rounded'
                  })
                ),

                React.createElement('div', null,
                  React.createElement('label', { className:'block text-xs text-gray-500 mb-1' }, 'Date fin (vide = 1 jour)'),
                  React.createElement('input', {
                    type:'date', value:newConge.dateFin, min:newConge.dateDebut,
                    onChange:(e)=>setNewConge({ ...newConge, dateFin:e.target.value }),
                    className:'w-full px-3 py-2 border rounded'
                  })
                ),

                React.createElement('button', {
                  onClick: ajouterConge,
                  disabled: !newConge.employe_id || !newConge.dateDebut,
                  className:'w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded transition'
                }, 'Ajouter')
              )
            ),

            // Panneau droite : aujourd'hui + stats + liste
            React.createElement('div', { className:'col-span-2 space-y-6' },

              React.createElement('div', { className:'grid grid-cols-2 gap-6' },

                // Absents aujourd'hui
                React.createElement('div', { className:'bg-white rounded shadow p-6' },
                  React.createElement('h3', { className:'font-bold text-lg mb-4' }, `Aujourd'hui (${aujourd_hui.getDate()}/${String(aujourd_hui.getMonth()+1).padStart(2,'0')})`),
                  getTodayAbsents().length === 0
                    ? React.createElement('p', { className:'text-gray-500 text-sm' }, 'Aucune absence')
                    : getTodayAbsents().map((a, i) => {
                        const cfg = getTypeConfig(a.type);
                        return React.createElement('div', { key:i, className:`flex gap-2 p-3 rounded mb-2 ${cfg.color}` },
                          React.createElement('span', null, cfg.icon),
                          React.createElement('div', null,
                            React.createElement('p', { className:'font-medium text-sm' }, a.employe.nom),
                            React.createElement('p', { className:'text-xs text-gray-600' }, a.type)
                          )
                        );
                      })
                ),

                // Stats
                React.createElement('div', { className:'bg-white rounded shadow p-6' },
                  React.createElement('h3', { className:'font-bold text-lg mb-4' }, 'Statistiques'),
                  React.createElement('div', { className:'space-y-2 text-sm' },
                    React.createElement('p', null, `👥 Collaborateurs : ${employes.length}`),
                    React.createElement('p', null, `📋 Périodes enregistrées : ${conges.length}`),
                    React.createElement('p', null, `📅 Jours d'absence : ${congesJours.length}`),
                    React.createElement('p', null, `🏠 Absents aujourd'hui : ${getTodayAbsents().length}`)
                  )
                )
              ),

              // Liste des congés enregistrés
              React.createElement('div', { className:'bg-white rounded shadow p-6' },
                React.createElement('h3', { className:'font-bold text-lg mb-4' }, 'Périodes de congé enregistrées'),
                conges.length === 0
                  ? React.createElement('p', { className:'text-gray-500 text-sm' }, 'Aucun congé enregistré.')
                  : React.createElement('div', { className:'overflow-x-auto' },
                    React.createElement('table', { className:'w-full text-sm border-collapse' },
                      React.createElement('thead', null,
                        React.createElement('tr', { className:'bg-gray-50 text-gray-500 text-left' },
                          React.createElement('th', { className:'px-3 py-2' }, 'Collaborateur'),
                          React.createElement('th', { className:'px-3 py-2' }, 'Type'),
                          React.createElement('th', { className:'px-3 py-2' }, 'Début'),
                          React.createElement('th', { className:'px-3 py-2' }, 'Fin'),
                          React.createElement('th', { className:'px-3 py-2 text-center' }, 'Jours'),
                          React.createElement('th', { className:'px-3 py-2' }, '')
                        )
                      ),
                      React.createElement('tbody', null,
                        conges
                          .slice()
                          .sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''))
                          .map(c => {
                            const emp = employes.find(e => e.id === c.employe_id);
                            const cfg = getTypeConfig(c.type);
                            // Rétrocompat : ancien format = 1 jour
                            const debut = c.dateDebut || c.date || '—';
                            const fin   = c.dateFin   || c.date || '—';
                            const nb    = c.nbJours   || 1;
                            return React.createElement('tr', { key:c.id, className:'border-t hover:bg-gray-50' },
                              React.createElement('td', { className:'px-3 py-2 font-medium' }, emp?.nom ?? c.employe_id),
                              React.createElement('td', { className:'px-3 py-2' },
                                React.createElement('span', { className:`px-2 py-1 rounded text-xs ${cfg.color} ${cfg.text}` }, `${cfg.icon} ${c.type}`)
                              ),
                              React.createElement('td', { className:'px-3 py-2' }, debut),
                              React.createElement('td', { className:'px-3 py-2' }, fin),
                              React.createElement('td', { className:'px-3 py-2 text-center font-bold' }, nb),
                              React.createElement('td', { className:'px-3 py-2' },
                                React.createElement('button', {
                                  onClick:()=>{ if(window.confirm('Supprimer ce congé ?')) supprimerConge(c.id); },
                                  className:'px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200'
                                }, '✕')
                              )
                            );
                          })
                      )
                    )
                  )
              )
            )
          )

          // ── Onglet Collaborateurs ──────────────────────────────────────────
          : React.createElement('div', { className:'grid grid-cols-3 gap-8' },
            React.createElement('div', { className:'col-span-1' },
              React.createElement('div', { className:'bg-white rounded shadow p-6 space-y-4' },
                React.createElement('h2', { className:'font-bold text-lg' }, editingId ? 'Modifier' : '+ Ajouter'),
                React.createElement('input', {
                  type:'text', value:newCollaborateur,
                  onChange:(e)=>setNewCollaborateur(e.target.value),
                  className:'w-full px-3 py-2 border rounded', placeholder:'Nom', required:true
                }),
                React.createElement('button', {
                  onClick: ajouterCollaborateur,
                  className:'w-full bg-blue-600 text-white py-2 rounded'
                }, editingId ? 'Mettre à jour' : 'Ajouter'),
                editingId && React.createElement('button', {
                  onClick:()=>{ setEditingId(null); setNewCollaborateur(''); },
                  className:'w-full bg-gray-100 py-2 rounded text-sm'
                }, 'Annuler')
              )
            ),
            React.createElement('div', { className:'col-span-2' },
              React.createElement('div', { className:'bg-white rounded shadow p-6' },
                React.createElement('h2', { className:'font-bold text-lg mb-4' }, `Collaborateurs (${employes.length})`),
                React.createElement('div', { className:'space-y-2' },
                  employes.map(e => {
                    const nbJours = congesJours.filter(c => c.employe_id === e.id).length;
                    return React.createElement('div', { key:e.id, className:'flex justify-between p-3 bg-gray-50 rounded' },
                      React.createElement('div', null,
                        React.createElement('p', { className:'font-medium text-sm' }, e.nom),
                        React.createElement('p', { className:'text-xs text-gray-600' }, `${nbJours} jour(s) d'absence`)
                      ),
                      React.createElement('div', { className:'flex gap-2' },
                        React.createElement('button', {
                          onClick:()=>{ setNewCollaborateur(e.nom); setEditingId(e.id); },
                          className:'px-2 py-1 bg-yellow-100 text-xs rounded'
                        }, 'Modifier'),
                        React.createElement('button', {
                          onClick:()=>supprimerCollaborateur(e.id),
                          className:'px-2 py-1 bg-red-100 text-xs rounded'
                        }, 'Supprimer')
                      )
                    );
                  })
                )
              )
            )
          )
      )
    );
  }

  // ── Render : vue publique (calendrier) ─────────────────────────────────────
  return React.createElement('div', { className:'min-h-screen bg-gray-50' },

    React.createElement('div', { className:'bg-white shadow-sm border-b' },
      React.createElement('div', { className:'max-w-4xl mx-auto px-6 py-4 flex justify-between items-center' },
        React.createElement('div', null,
          React.createElement('h1', { className:'text-2xl font-bold' }, 'Calendrier des Congés'),
          React.createElement('p', { className:'text-sm text-gray-600' }, aujourd_hui.toLocaleDateString('fr-BE'))
        ),
        React.createElement('div', { className:'flex items-center gap-4' },
          React.createElement('span', { className:'text-xs text-gray-500' }, `v${APP_VERSION}`),
          React.createElement('button', {
            onClick:()=>setShowRHLogin(true),
            className:'px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2'
          }, React.createElement(Lock), ' RH')
        )
      )
    ),

    React.createElement('div', { className:'max-w-4xl mx-auto px-6 py-8' },

      // Absents du jour sélectionné
      React.createElement('div', { className:'bg-white rounded shadow p-6 mb-6' },
        React.createElement('h2', { className:'font-bold mb-4' },
          `Absences du ${String(jourAffiche).padStart(2,'0')}/${String(moisActuel.getMonth()+1).padStart(2,'0')}/${moisActuel.getFullYear()}`
        ),
        getAbsentsOfDay(jourAffiche).length === 0
          ? React.createElement('p', { className:'text-gray-500 text-sm' }, 'Aucune absence ce jour')
          : getAbsentsOfDay(jourAffiche).map((a, i) => {
              const cfg = getTypeConfig(a.type);
              return React.createElement('div', { key:i, className:`flex gap-3 p-3 rounded border ${cfg.color} ${cfg.border} mb-2` },
                React.createElement('span', null, cfg.icon),
                React.createElement('div', null,
                  React.createElement('p', { className:'font-medium text-sm' }, a.employe.nom),
                  React.createElement('p', { className:`text-xs ${cfg.text}` }, `${a.type} : ${a.dateDebut} → ${a.dateFin}`)
                )
              );
            })
      ),

      // Calendrier
      React.createElement('div', { className:'bg-white rounded shadow p-8' },
        React.createElement('div', { className:'flex justify-between items-center mb-6' },
          React.createElement('button', { onClick:()=>setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth()-1, 1)) }, React.createElement(ChevronLeft)),
          React.createElement('h2', { className:'text-2xl font-bold text-center' }, `${monthName[moisActuel.getMonth()]} ${moisActuel.getFullYear()}`),
          React.createElement('button', { onClick:()=>setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth()+1, 1)) }, React.createElement(ChevronRight))
        ),
        React.createElement('div', { className:'grid grid-cols-7 gap-2 mb-4' },
          ['L','M','M','J','V','S','D'].map((d,i) => React.createElement('div', { key:i, className:'text-center font-bold py-2 text-xs' }, d))
        ),
        React.createElement('div', { className:'grid grid-cols-7 gap-2' },
          Array(getFirstDayOfMonth(moisActuel) === 0 ? 6 : getFirstDayOfMonth(moisActuel) - 1)
            .fill(null).map((_,i) => React.createElement('div', { key:`e${i}` })),
          Array(getDaysInMonth(moisActuel)).fill(null).map((_,i) => {
            const day          = i + 1;
            const congesDuJour = isDateInConges(day);
            const isToday      = day === aujourd_hui.getDate() && moisActuel.getMonth() === aujourd_hui.getMonth() && moisActuel.getFullYear() === aujourd_hui.getFullYear();
            const cfg          = congesDuJour.length > 0 ? getTypeConfig(congesDuJour[0].type) : null;
            const dateFormatted = `${String(day).padStart(2,'0')}/${String(moisActuel.getMonth()+1).padStart(2,'0')}`;
            const absentsNames  = getAbsentsNames(day);

            return React.createElement('div', {
              key: day,
              onClick: () => setJourAffiche(day),
              className: `aspect-square rounded border-2 flex flex-col justify-between p-2 cursor-pointer ${
                isToday ? 'bg-green-100 border-green-400 ring-2 ring-green-300' :
                cfg ? `${cfg.color} ${cfg.border}` : 'bg-gray-50 border-gray-200'
              }`,
              title: absentsNames,
            },
              React.createElement('span', { className:'text-xs font-bold text-gray-700' }, dateFormatted),
              congesDuJour.length > 0 && React.createElement('div', { className:'flex items-center justify-center' },
                React.createElement('span', {
                  className:'bg-gray-700 text-white text-xs font-bold px-2 py-1 rounded-full',
                  title: absentsNames
                }, congesDuJour.length)
              )
            );
          })
        )
      )
    )
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(CongesApp));
