const { useState, useEffect } = React;

// ===== VERSION =====
const APP_VERSION = "2.0.0-firebase-clean";

// ===== FIREBASE CONFIG =====
const FIREBASE_URL = "https://conges-belgique-default-rtdb.europe-west1.firebasedatabase.app";
const FIREBASE_API_KEY = "AIzaSyBphnA1yYQpGLd66yuReFK7dgwoIsgLwGE";

// Fonction helper pour ajouter la clé API aux URLs Firebase
const getFirebaseUrl = (path) => `${FIREBASE_URL}${path}.json?auth=${FIREBASE_API_KEY}`;

const TYPES_CONFIG = {
  'Congé': { color: 'bg-blue-100', border: 'border-blue-400', icon: '🏖️', text: 'text-blue-700' },
  'Maladie': { color: 'bg-orange-100', border: 'border-orange-400', icon: '🤒', text: 'text-orange-700' },
  'Temps partiel': { color: 'bg-yellow-100', border: 'border-yellow-400', icon: '⏰', text: 'text-yellow-700' }
};

const getTypeConfig = (type) => {
  if (!type) return TYPES_CONFIG['Congé'];
  const t = type.toString().trim();
  if (t.toLowerCase().includes('maladie')) return TYPES_CONFIG['Maladie'];
  if (t.toLowerCase().includes('partiel')) return TYPES_CONFIG['Temps partiel'];
  return TYPES_CONFIG['Congé'];
};

const CongesApp = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [showRHLogin, setShowRHLogin] = useState(false);
  const [rhPassword, setRhPassword] = useState('');
  const [rhLoginError, setRhLoginError] = useState('');
  const [rhPage, setRhPage] = useState('congés');

  const [employes, setEmployes] = useState([]);
  const [conges, setConges] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newCollaborateur, setNewCollaborateur] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [newConge, setNewConge] = useState({ employe_id: '', dateDebut: '', dateFin: '', type: 'Congé' });

  const aujourd_hui = new Date();
  const [moisActuel, setMoisActuel] = useState(new Date(aujourd_hui.getFullYear(), aujourd_hui.getMonth(), 1));
  const [jourAffiche, setJourAffiche] = useState(aujourd_hui.getDate());

  useEffect(() => {
    chargerDonnees();
    const interval = setInterval(chargerDonnees, 2000);
    return () => clearInterval(interval);
  }, []);

  const chargerDonnees = async () => {
    try {
      const empResponse = await fetch(getFirebaseUrl('/employes'));
      if (empResponse.ok) {
        const empData = await empResponse.json();
        if (empData) {
          const empList = Object.entries(empData).map(([key, value]) => ({ id: key, nom: value.nom }));
          setEmployes(empList);
        } else {
          setEmployes([]);
        }
      }

      const conResponse = await fetch(getFirebaseUrl('/conges'));
      if (conResponse.ok) {
        const conData = await conResponse.json();
        if (conData) {
          const conList = Object.entries(conData).map(([key, value]) => ({ id: key, ...value }));
          setConges(conList);
        } else {
          setConges([]);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error('Erreur Firebase:', error);
      setLoading(false);
    }
  };

  const ajouterCollaborateur = (e) => {
    e.preventDefault();
    if (!newCollaborateur.trim()) return;

    const newId = editingId || `emp_${Date.now()}`;
    const newEmp = { nom: newCollaborateur };

    fetch(getFirebaseUrl(`/employes/${newId}`), {
      method: 'PUT',
      body: JSON.stringify(newEmp)
    })
    .then(resp => {
      if (!resp.ok) throw new Error(`Erreur Firebase: ${resp.status}`);
      return resp.json();
    })
    .then(() => {
      chargerDonnees();
      setNewCollaborateur('');
      setEditingId(null);
      alert('Enregistré');
    })
    .catch(err => {
      console.error('Erreur ajout collaborateur:', err);
      alert('Erreur: ' + err.message);
    });
  };

  const supprimerCollaborateur = (id) => {
    if (conges.some(c => c.employe_id === id) && !window.confirm('Supprimer ?')) return;
    fetch(getFirebaseUrl(`/employes/${id}`), { method: 'DELETE' })
    .then(() => chargerDonnees());
  };

  const ajouterConge = (e) => {
    e.preventDefault();
    if (!newConge.employe_id || !newConge.dateDebut) return;

    const dateDebut = new Date(newConge.dateDebut);
    const dateFin = newConge.dateFin ? new Date(newConge.dateFin) : dateDebut;
    let currentDate = new Date(dateDebut);

    const promises = [];
    while (currentDate <= dateFin) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const congeId = `conge_${Date.now()}_${Math.random()}`;
      promises.push(
        fetch(getFirebaseUrl(`/conges/${congeId}`), {
          method: 'PUT',
          body: JSON.stringify({ employe_id: newConge.employe_id, date: dateStr, type: newConge.type })
        }).then(resp => {
          if (!resp.ok) throw new Error(`Erreur Firebase: ${resp.status}`);
          return resp.json();
        })
      );
      currentDate.setDate(currentDate.getDate() + 1);
    }

    Promise.all(promises)
    .then(() => {
      chargerDonnees();
      setNewConge({ employe_id: '', dateDebut: '', dateFin: '', type: 'Congé' });
      alert('Ajouté');
    })
    .catch(err => {
      console.error('Erreur ajout congé:', err);
      alert('Erreur: ' + err.message);
    });
  };

  const supprimerConge = (id) => {
    fetch(getFirebaseUrl(`/conges/${id}`), { method: 'DELETE' })
    .then(() => chargerDonnees());
  };

  const handleRHLogin = (e) => {
    e.preventDefault();
    if (rhPassword === 'encodageconge') {
      setCurrentUser({ type: 'RH' });
      setShowRHLogin(false);
      setRhPassword('');
    } else {
      setRhLoginError('Incorrect');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setRhPage('congés');
    setShowRHLogin(false);
  };

  const getDaysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  
  const isDateInConges = (day) => {
    const dateStr = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return conges.filter(c => c.date === dateStr);
  };

  const getAbsentsOfDay = (day) => {
    const dateStr = `${moisActuel.getFullYear()}-${String(moisActuel.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return conges.filter(c => c.date === dateStr).map(conge => {
      const employe = employes.find(e => e.id === conge.employe_id);
      const allCongesForEmployee = conges.filter(c => c.employe_id === conge.employe_id).map(c => new Date(c.date)).sort((a, b) => a - b);
      
      if (!allCongesForEmployee.length) return null;
      const targetDate = new Date(dateStr);
      let periodDebut = null, periodFin = null;
      
      for (let i = 0; i < allCongesForEmployee.length; i++) {
        if (allCongesForEmployee[i].toDateString() === targetDate.toDateString()) {
          periodDebut = allCongesForEmployee[i];
          let j = i;
          while (j < allCongesForEmployee.length - 1) {
            if (Math.floor((allCongesForEmployee[j + 1] - allCongesForEmployee[j]) / (1000 * 60 * 60 * 24)) > 1) {
              periodFin = allCongesForEmployee[j];
              break;
            }
            j++;
          }
          if (!periodFin) periodFin = allCongesForEmployee[allCongesForEmployee.length - 1];
          break;
        }
      }
      
      return periodDebut && employe ? { employe, dateDebut: periodDebut.toLocaleDateString('fr-BE'), dateFin: periodFin.toLocaleDateString('fr-BE'), type: conge.type } : null;
    }).filter(Boolean);
  };

  const getAbsentsNames = (day) => {
    return getAbsentsOfDay(day).map(a => a.employe.nom).join('\n');
  };

  const getTodayAbsents = () => {
    return getAbsentsOfDay(aujourd_hui.getDate());
  };

  const monthName = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const ChevronLeft = () => React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('polyline', { points: '15 18 9 12 15 6' }));
  const ChevronRight = () => React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('polyline', { points: '9 18 15 12 9 6' }));
  const LogOut = () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }), React.createElement('polyline', { points: '16 17 21 12 16 7' }), React.createElement('line', { x1: 21, y1: 12, x2: 9, y2: 12 }));
  const Lock = () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }), React.createElement('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }));

  if (loading) return React.createElement('div', { className: 'min-h-screen bg-gray-50 flex items-center justify-center' }, React.createElement('p', null, `v${APP_VERSION} - Chargement...`));

  if (showRHLogin) {
    return React.createElement('div', { className: 'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4' },
      React.createElement('div', { className: 'bg-white rounded-lg shadow-2xl p-8 w-full max-w-md' },
        React.createElement('h1', { className: 'text-3xl font-bold mb-8 text-center' }, 'Accès RH'),
        React.createElement('form', { onSubmit: handleRHLogin, className: 'space-y-4' },
          React.createElement('input', { type: 'password', value: rhPassword, onChange: (e) => setRhPassword(e.target.value), className: 'w-full px-4 py-2 border rounded-lg', placeholder: 'Mot de passe', required: true }),
          rhLoginError && React.createElement('div', { className: 'bg-red-50 text-red-700 px-4 py-3 rounded text-sm' }, rhLoginError),
          React.createElement('button', { type: 'submit', className: 'w-full bg-blue-600 text-white py-2 rounded-lg' }, 'Connexion'),
          React.createElement('button', { type: 'button', onClick: () => { setShowRHLogin(false); setRhPassword(''); }, className: 'w-full bg-gray-100 py-2 rounded-lg' }, 'Annuler'),
          React.createElement('p', { className: 'text-xs text-gray-500 text-center mt-4' }, `v${APP_VERSION}`)
        )
      )
    );
  }

  if (currentUser?.type === 'RH') {
    return React.createElement('div', { className: 'min-h-screen bg-red-50' },
      React.createElement('div', { className: 'bg-white shadow-sm border-b' },
        React.createElement('div', { className: 'max-w-7xl mx-auto px-6 py-4' },
          React.createElement('div', { className: 'flex justify-between items-center mb-4' },
            React.createElement('div', null,
              React.createElement('h1', { className: 'text-2xl font-bold' }, 'RH - Gestion des Congés'),
              React.createElement('p', { className: 'text-sm text-gray-600' }, `${aujourd_hui.toLocaleDateString('fr-BE')} | v${APP_VERSION}`)
            ),
            React.createElement('button', { onClick: handleLogout, className: 'px-4 py-2 bg-red-50 text-red-700 rounded-lg flex items-center gap-2' }, React.createElement(LogOut), 'Déco')
          ),
          React.createElement('div', { className: 'flex gap-2' },
            React.createElement('button', { onClick: () => setRhPage('congés'), className: `px-6 py-3 border-b-2 ${rhPage === 'congés' ? 'border-red-600 text-red-600' : 'border-transparent'}` }, 'Congés'),
            React.createElement('button', { onClick: () => setRhPage('collaborateurs'), className: `px-6 py-3 border-b-2 ${rhPage === 'collaborateurs' ? 'border-red-600 text-red-600' : 'border-transparent'}` }, `${employes.length}`)
          )
        )
      ),
      React.createElement('div', { className: 'max-w-7xl mx-auto px-6 py-8' },
        rhPage === 'congés' ? React.createElement('div', { className: 'grid grid-cols-3 gap-8' },
          React.createElement('div', { className: 'col-span-1' },
            React.createElement('div', { className: 'bg-white rounded shadow p-6 space-y-4' },
              React.createElement('h2', { className: 'font-bold text-lg' }, '+ Absence'),
              React.createElement('select', { value: newConge.employe_id, onChange: (e) => setNewConge({ ...newConge, employe_id: e.target.value }), className: 'w-full px-3 py-2 border rounded' },
                React.createElement('option', { value: '' }, 'Sélectionner...'),
                employes.map(e => React.createElement('option', { key: e.id, value: e.id }, e.nom))
              ),
              React.createElement('select', { value: newConge.type, onChange: (e) => setNewConge({ ...newConge, type: e.target.value }), className: 'w-full px-3 py-2 border rounded' },
                ['Congé', 'Maladie', 'Temps partiel'].map(t => React.createElement('option', { key: t, value: t }, `${getTypeConfig(t).icon} ${t}`))
              ),
              React.createElement('input', { type: 'date', value: newConge.dateDebut, onChange: (e) => setNewConge({ ...newConge, dateDebut: e.target.value }), className: 'w-full px-3 py-2 border rounded', required: true }),
              React.createElement('input', { type: 'date', value: newConge.dateFin, onChange: (e) => setNewConge({ ...newConge, dateFin: e.target.value }), className: 'w-full px-3 py-2 border rounded' }),
              React.createElement('button', { onClick: ajouterConge, className: 'w-full bg-green-600 text-white py-2 rounded' }, 'Ajouter')
            )
          ),
          React.createElement('div', { className: 'col-span-2' },
            React.createElement('div', { className: 'grid grid-cols-2 gap-8' },
              React.createElement('div', { className: 'bg-white rounded shadow p-6' },
                React.createElement('h3', { className: 'font-bold text-lg mb-4' }, `Auj (${aujourd_hui.getDate()})`),
                getTodayAbsents().length === 0 ? React.createElement('p', { className: 'text-gray-500' }, 'Aucune') :
                  getTodayAbsents().map((a, i) => {
                    const cfg = getTypeConfig(a.type);
                    return React.createElement('div', { key: i, className: `flex gap-2 p-3 rounded mb-2 ${cfg.color}` },
                      React.createElement('span', null, cfg.icon),
                      React.createElement('div', null,
                        React.createElement('p', { className: 'font-medium text-sm' }, a.employe.nom),
                        React.createElement('p', { className: 'text-xs text-gray-600' }, a.type)
                      )
                    );
                  })
              ),
              React.createElement('div', { className: 'bg-white rounded shadow p-6' },
                React.createElement('h3', { className: 'font-bold text-lg mb-4' }, 'Stats'),
                React.createElement('div', { className: 'space-y-2 text-sm' },
                  React.createElement('p', null, `Collabs: ${employes.length}`),
                  React.createElement('p', null, `Absences: ${conges.length}`),
                  React.createElement('p', null, `Auj: ${getTodayAbsents().length}`)
                )
              )
            )
          )
        ) : React.createElement('div', { className: 'grid grid-cols-3 gap-8' },
          React.createElement('div', { className: 'col-span-1' },
            React.createElement('div', { className: 'bg-white rounded shadow p-6 space-y-4' },
              React.createElement('h2', { className: 'font-bold text-lg' }, editingId ? 'Modifier' : '+ Ajouter'),
              React.createElement('input', { type: 'text', value: newCollaborateur, onChange: (e) => setNewCollaborateur(e.target.value), className: 'w-full px-3 py-2 border rounded', placeholder: 'Nom', required: true }),
              React.createElement('button', { onClick: ajouterCollaborateur, className: 'w-full bg-blue-600 text-white py-2 rounded' }, editingId ? 'Mettre à jour' : 'Ajouter')
            )
          ),
          React.createElement('div', { className: 'col-span-2' },
            React.createElement('div', { className: 'bg-white rounded shadow p-6' },
              React.createElement('h2', { className: 'font-bold text-lg mb-4' }, `Collaborateurs (${employes.length})`),
              React.createElement('div', { className: 'space-y-2' },
                employes.map(e => {
                  const nbConges = conges.filter(c => c.employe_id === e.id).length;
                  return React.createElement('div', { key: e.id, className: 'flex justify-between p-3 bg-gray-50 rounded' },
                    React.createElement('div', null,
                      React.createElement('p', { className: 'font-medium text-sm' }, e.nom),
                      React.createElement('p', { className: 'text-xs text-gray-600' }, `${nbConges}j`)
                    ),
                    React.createElement('div', { className: 'flex gap-2' },
                      React.createElement('button', { onClick: () => { setNewCollaborateur(e.nom); setEditingId(e.id); }, className: 'px-2 py-1 bg-yellow-100 text-xs rounded' }, 'Modifier'),
                      React.createElement('button', { onClick: () => supprimerCollaborateur(e.id), className: 'px-2 py-1 bg-red-100 text-xs rounded' }, 'Supprimer')
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

  return React.createElement('div', { className: 'min-h-screen bg-gray-50' },
    React.createElement('div', { className: 'bg-white shadow-sm border-b' },
      React.createElement('div', { className: 'max-w-4xl mx-auto px-6 py-4 flex justify-between items-center' },
        React.createElement('div', null,
          React.createElement('h1', { className: 'text-2xl font-bold' }, 'Calendrier des Congés'),
          React.createElement('p', { className: 'text-sm text-gray-600' }, aujourd_hui.toLocaleDateString('fr-BE'))
        ),
        React.createElement('div', { className: 'flex items-center gap-4' },
          React.createElement('span', { className: 'text-xs text-gray-500' }, `v${APP_VERSION}`),
          React.createElement('button', { onClick: () => setShowRHLogin(true), className: 'px-4 py-2 bg-blue-600 text-white rounded-lg' }, React.createElement(Lock), ' RH')
        )
      )
    ),
    React.createElement('div', { className: 'max-w-4xl mx-auto px-6 py-8' },
      React.createElement('div', { className: 'bg-white rounded shadow p-6 mb-6' },
        React.createElement('h2', { className: 'font-bold mb-4' }, `Absences du ${jourAffiche}/${String(moisActuel.getMonth() + 1).padStart(2, '0')}`),
        getAbsentsOfDay(jourAffiche).length === 0 ? React.createElement('p', { className: 'text-gray-500' }, 'Aucune') :
          getAbsentsOfDay(jourAffiche).map((a, i) => {
            const cfg = getTypeConfig(a.type);
            return React.createElement('div', { key: i, className: `flex gap-3 p-3 rounded border ${cfg.color} ${cfg.border}` },
              React.createElement('span', null, cfg.icon),
              React.createElement('div', null,
                React.createElement('p', { className: 'font-medium text-sm' }, a.employe.nom),
                React.createElement('p', { className: `text-xs ${cfg.text}` }, `${a.type}: ${a.dateDebut} → ${a.dateFin}`)
              )
            );
          })
      ),
      React.createElement('div', { className: 'bg-white rounded shadow p-8' },
        React.createElement('div', { className: 'flex justify-between items-center mb-6' },
          React.createElement('button', { onClick: () => setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() - 1, 1)) }, React.createElement(ChevronLeft)),
          React.createElement('h2', { className: 'text-2xl font-bold text-center' }, `${monthName[moisActuel.getMonth()]} ${moisActuel.getFullYear()}`),
          React.createElement('button', { onClick: () => setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() + 1, 1)) }, React.createElement(ChevronRight))
        ),
        React.createElement('div', { className: 'grid grid-cols-7 gap-2 mb-4' },
          ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => React.createElement('div', { key: d, className: 'text-center font-bold py-2 text-xs' }, d))
        ),
        React.createElement('div', { className: 'grid grid-cols-7 gap-2' },
          Array(getFirstDayOfMonth(moisActuel) === 0 ? 6 : getFirstDayOfMonth(moisActuel) - 1).fill(null).map((_, i) => React.createElement('div', { key: `e${i}` })),
          Array(getDaysInMonth(moisActuel)).fill(null).map((_, i) => {
            const day = i + 1;
            const congesDuJour = isDateInConges(day);
            const isToday = day === aujourd_hui.getDate() && moisActuel.getMonth() === aujourd_hui.getMonth();
            const cfg = congesDuJour.length > 0 ? getTypeConfig(congesDuJour[0].type) : null;
            const dateFormatted = `${String(day).padStart(2, '0')}/${String(moisActuel.getMonth() + 1).padStart(2, '0')}`;
            const absentsNames = getAbsentsNames(day);
            
            return React.createElement('div', {
              key: day,
              onClick: () => setJourAffiche(day),
              className: `aspect-square rounded border-2 flex flex-col justify-between p-2 cursor-pointer ${
                isToday ? 'bg-green-100 border-green-400 ring-2 ring-green-300' :
                cfg ? cfg.color + ' ' + cfg.border : 'bg-gray-50 border-gray-200'
              }`,
              title: absentsNames
            },
              React.createElement('span', { className: 'text-xs font-bold text-gray-700' }, dateFormatted),
              congesDuJour.length > 0 && React.createElement('div', { className: 'flex items-center justify-center' },
                React.createElement('span', { className: 'bg-gray-700 text-white text-xs font-bold px-2 py-1 rounded-full', title: absentsNames }, congesDuJour.length)
              )
            );
          })
        )
      )
    )
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(CongesApp));
