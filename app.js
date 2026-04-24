const { useState, useEffect } = React;

// ===== CONFIG =====
const SHEET_ID = '13t6vYcYKBr3iDR_VoAMXYJNcXtSOoeVHPqmOvACLtQo';
const API_KEY = 'AIzaSyCtXkkDhQGL1Yk4coodB6tP7VfgSAJtaqg';
const SHEETS_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`;

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
  const [showRHPassword, setShowRHPassword] = useState(false);
  const [rhPage, setRhPage] = useState('congés');
  const [selectedSite, setSelectedSite] = useState('Tous');

  const [employes, setEmployes] = useState(() => {
    const saved = localStorage.getItem('conges_employes');
    return saved ? JSON.parse(saved) : [];
  });

  const [conges, setConges] = useState(() => {
    const saved = localStorage.getItem('conges_list');
    return saved ? JSON.parse(saved) : [];
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sites, setSites] = useState([]);

  const [newCollaborateur, setNewCollaborateur] = useState({ nom: '', role: '', site: '' });
  const [editingId, setEditingId] = useState(null);
  const [newConge, setNewConge] = useState({ employe_id: 1, dateDebut: '', dateFin: '', type: 'Congé' });

  const aujourd_hui = new Date();
  const [moisActuel, setMoisActuel] = useState(new Date(aujourd_hui.getFullYear(), aujourd_hui.getMonth(), 1));
  const [jourAffiche, setJourAffiche] = useState(aujourd_hui.getDate());

  useEffect(() => {
    chargerDonneesSheet();
  }, []);

  useEffect(() => {
    localStorage.setItem('conges_employes', JSON.stringify(employes));
  }, [employes]);

  useEffect(() => {
    localStorage.setItem('conges_list', JSON.stringify(conges));
  }, [conges]);

  useEffect(() => {
    const sitesUniques = [...new Set(employes.map(e => e.site).filter(Boolean))];
    setSites(['Tous', ...sitesUniques]);
  }, [employes]);

  const chargerDonneesSheet = async () => {
    try {
      setLoading(true);
      const employesResponse = await fetch(`${SHEETS_API_URL}/Collaborateurs?key=${API_KEY}`);
      const employesData = await employesResponse.json();
      
      if (employesData.values && employesData.values.length > 1 && employes.length === 0) {
        const employesList = employesData.values.slice(1).map((row, idx) => ({
          id: parseInt(row[0]) || idx + 1,
          nom: row[1] || '',
          role: row[2] || '',
          site: row[3] || 'Défaut'
        }));
        setEmployes(employesList);
      }

      const congesResponse = await fetch(`${SHEETS_API_URL}/Congés?key=${API_KEY}`);
      const congesData = await congesResponse.json();
      
      if (congesData.values && congesData.values.length > 1 && conges.length === 0) {
        const congesList = congesData.values.slice(1).map((row, idx) => ({
          id: parseInt(row[0]) || idx + 1,
          employe_id: parseInt(row[1]) || 1,
          date: row[2] || '',
          type: row[3] || 'Congé'
        }));
        setConges(congesList);
      }
      setLoading(false);
    } catch (error) {
      console.error('Erreur:', error);
      setLoading(false);
    }
  };

  const ajouterCollaborateur = (e) => {
    e.preventDefault();
    if (!newCollaborateur.nom || !newCollaborateur.role || !newCollaborateur.site) return;

    const newId = Math.max(...employes.map(e => e.id || 0), 0) + 1;

    if (editingId) {
      setEmployes(employes.map(emp => 
        emp.id === editingId ? { ...emp, nom: newCollaborateur.nom, role: newCollaborateur.role, site: newCollaborateur.site } : emp
      ));
      setEditingId(null);
    } else {
      setEmployes([...employes, { id: newId, nom: newCollaborateur.nom, role: newCollaborateur.role, site: newCollaborateur.site }]);
    }
    setNewCollaborateur({ nom: '', role: '', site: '' });
    alert('✅ Enregistré !');
  };

  const supprimerCollaborateur = (id) => {
    if (conges.some(c => c.employe_id === id) && !window.confirm('Supprimer ?')) return;
    setEmployes(employes.filter(e => e.id !== id));
    setConges(conges.filter(c => c.employe_id !== id));
  };

  const ajouterConge = (e) => {
    e.preventDefault();
    if (!newConge.employe_id || !newConge.dateDebut) return;

    const dateDebut = new Date(newConge.dateDebut);
    const dateFin = newConge.dateFin ? new Date(newConge.dateFin) : dateDebut;
    const nouvellesEntrees = [];

    const currentDate = new Date(dateDebut);
    while (currentDate <= dateFin) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (!conges.some(c => c.employe_id === parseInt(newConge.employe_id) && c.date === dateStr)) {
        nouvellesEntrees.push({
          id: Math.max(...conges.map(c => c.id || 0), 0) + nouvellesEntrees.length + 1,
          employe_id: parseInt(newConge.employe_id),
          date: dateStr,
          type: newConge.type
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    setConges([...conges, ...nouvellesEntrees]);
    setNewConge({ employe_id: 1, dateDebut: '', dateFin: '', type: 'Congé' });
    alert('✅ Ajouté !');
  };

  const supprimerConge = (id) => {
    setConges(conges.filter(c => c.id !== id));
  };

  const synchroniserVersSheets = async () => {
    setSyncing(true);
    alert('📤 Données:\n\nPour synchro: consultez votre Google Sheet');
    setSyncing(false);
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
    setRhPassword('');
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
      
      if (allCongesForEmployee.length === 0) return null;
      
      const targetDate = new Date(dateStr);
      let periodDebut = null, periodFin = null;
      
      for (let i = 0; i < allCongesForEmployee.length; i++) {
        if (allCongesForEmployee[i].toDateString() === targetDate.toDateString()) {
          periodDebut = allCongesForEmployee[i];
          let j = i;
          while (j < allCongesForEmployee.length - 1) {
            const diffDays = Math.floor((allCongesForEmployee[j + 1] - allCongesForEmployee[j]) / (1000 * 60 * 60 * 24));
            if (diffDays > 1) { periodFin = allCongesForEmployee[j]; break; }
            j++;
          }
          if (!periodFin) periodFin = allCongesForEmployee[allCongesForEmployee.length - 1];
          break;
        }
      }
      
      return periodDebut && employe ? { employe, dateDebut: periodDebut.toLocaleDateString('fr-BE'), dateFin: periodFin.toLocaleDateString('fr-BE'), type: conge.type } : null;
    }).filter(Boolean);
  };

  const getEmployesBySite = () => selectedSite === 'Tous' ? employes : employes.filter(e => e.site === selectedSite);

  const monthName = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  const ChevronLeft = () => React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('polyline', { points: '15 18 9 12 15 6' }));
  const ChevronRight = () => React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('polyline', { points: '9 18 15 12 9 6' }));
  const LogOut = () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }), React.createElement('polyline', { points: '16 17 21 12 16 7' }), React.createElement('line', { x1: 21, y1: 12, x2: 9, y2: 12 }));
  const Lock = () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, React.createElement('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }), React.createElement('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }));

  if (loading) return React.createElement('div', { className: 'min-h-screen bg-gray-50 flex items-center justify-center' }, React.createElement('p', { className: 'text-gray-600' }, 'Chargement...'));

  if (showRHLogin) {
    return React.createElement('div', { className: 'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4' },
      React.createElement('div', { className: 'bg-white rounded-lg shadow-2xl p-8 w-full max-w-md' },
        React.createElement('h1', { className: 'text-3xl font-bold mb-8 text-center' }, 'Accès RH'),
        React.createElement('form', { onSubmit: handleRHLogin, className: 'space-y-4' },
          React.createElement('input', { type: 'password', value: rhPassword, onChange: (e) => setRhPassword(e.target.value), className: 'w-full px-4 py-2 border border-gray-300 rounded-lg', placeholder: 'Mot de passe', required: true }),
          rhLoginError && React.createElement('div', { className: 'bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm' }, rhLoginError),
          React.createElement('button', { type: 'submit', className: 'w-full bg-blue-600 text-white py-2 rounded-lg' }, 'Se connecter'),
          React.createElement('button', { type: 'button', onClick: () => { setShowRHLogin(false); setRhPassword(''); }, className: 'w-full bg-gray-100 py-2 rounded-lg' }, 'Annuler')
        )
      )
    );
  }

  if (currentUser?.type === 'RH') {
    return React.createElement('div', { className: 'min-h-screen bg-gray-50' },
      React.createElement('div', { className: 'bg-white shadow-sm border-b' },
        React.createElement('div', { className: 'max-w-7xl mx-auto px-6 py-4' },
          React.createElement('div', { className: 'flex justify-between items-center mb-4' },
            React.createElement('div', null,
              React.createElement('h1', { className: 'text-2xl font-bold' }, 'Gestion des Congés'),
              React.createElement('p', { className: 'text-sm text-gray-600' }, `📅 ${aujourd_hui.toLocaleDateString('fr-BE')}`)
            ),
            React.createElement('button', { onClick: handleLogout, className: 'px-4 py-2 bg-red-50 text-red-700 rounded-lg' }, 'Déconnexion')
          ),
          React.createElement('div', { className: 'flex gap-2' },
            React.createElement('button', { onClick: () => setRhPage('congés'), className: `px-6 py-3 border-b-2 ${rhPage === 'congés' ? 'border-blue-600 text-blue-600' : 'border-transparent'}` }, '📅 Congés'),
            React.createElement('button', { onClick: () => setRhPage('collaborateurs'), className: `px-6 py-3 border-b-2 ${rhPage === 'collaborateurs' ? 'border-blue-600 text-blue-600' : 'border-transparent'}` }, `👥 ${getEmployesBySite().length}`)
          )
        )
      ),
      React.createElement('div', { className: 'max-w-7xl mx-auto px-6 py-8' },
        rhPage === 'congés' ? React.createElement('div', { className: 'grid grid-cols-3 gap-8' },
          React.createElement('div', { className: 'col-span-1' },
            React.createElement('div', { className: 'bg-white rounded shadow p-6 space-y-4' },
              React.createElement('h2', { className: 'font-bold' }, '+ Absence'),
              React.createElement('select', { value: newConge.employe_id, onChange: (e) => setNewConge({ ...newConge, employe_id: e.target.value }), className: 'w-full px-3 py-2 border rounded' },
                getEmployesBySite().map(e => React.createElement('option', { key: e.id, value: e.id }, e.nom))
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
            React.createElement('div', { className: 'bg-white rounded shadow p-8' },
              React.createElement('div', { className: 'flex justify-between items-center mb-6' },
                React.createElement('button', { onClick: () => setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() - 1, 1)) }, React.createElement(ChevronLeft)),
                React.createElement('div', null,
                  React.createElement('h2', { className: 'text-2xl font-bold text-center' }, `${monthName[moisActuel.getMonth()]} ${moisActuel.getFullYear()}`),
                  React.createElement('p', { className: 'text-sm text-gray-600 text-center' }, `Auj: ${aujourd_hui.getDate()}`)
                ),
                React.createElement('button', { onClick: () => setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() + 1, 1)) }, React.createElement(ChevronRight))
              ),
              React.createElement('div', { className: 'grid grid-cols-7 gap-2 mb-4' },
                ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => React.createElement('div', { key: d, className: 'text-center font-bold py-2' }, d))
              ),
              React.createElement('div', { className: 'grid grid-cols-7 gap-2' },
                Array(getFirstDayOfMonth(moisActuel) === 0 ? 6 : getFirstDayOfMonth(moisActuel) - 1).fill(null).map((_, i) => React.createElement('div', { key: `e${i}` })),
                Array(getDaysInMonth(moisActuel)).fill(null).map((_, i) => {
                  const day = i + 1;
                  const congesDuJour = isDateInConges(day);
                  const isToday = day === aujourd_hui.getDate() && moisActuel.getMonth() === aujourd_hui.getMonth();
                  const cfg = congesDuJour.length > 0 ? getTypeConfig(congesDuJour[0].type) : null;
                  
                  return React.createElement('div', {
                    key: day,
                    onClick: () => setJourAffiche(day),
                    className: `aspect-square rounded border-2 flex items-center justify-center font-semibold cursor-pointer ${
                      isToday ? 'bg-green-100 border-green-400 ring-2 ring-green-300' :
                      cfg ? cfg.color + ' ' + cfg.border : 'bg-gray-50 border-gray-200'
                    }`
                  },
                    day,
                    congesDuJour.length > 0 && React.createElement('span', { className: 'absolute text-xs bg-gray-600 text-white w-5 h-5 rounded-full flex items-center justify-center' }, congesDuJour.length)
                  );
                })
              )
            )
          )
        ) : React.createElement('div', { className: 'grid grid-cols-3 gap-8' },
          React.createElement('div', { className: 'col-span-1' },
            React.createElement('div', { className: 'bg-white rounded shadow p-6 space-y-4' },
              React.createElement('h2', { className: 'font-bold' }, editingId ? '✎ Modifier' : '+ Ajouter'),
              React.createElement('input', { type: 'text', value: newCollaborateur.nom, onChange: (e) => setNewCollaborateur({ ...newCollaborateur, nom: e.target.value }), className: 'w-full px-3 py-2 border rounded', placeholder: 'Nom', required: true }),
              React.createElement('input', { type: 'text', value: newCollaborateur.role, onChange: (e) => setNewCollaborateur({ ...newCollaborateur, role: e.target.value }), className: 'w-full px-3 py-2 border rounded', placeholder: 'Rôle', required: true }),
              React.createElement('input', { type: 'text', value: newCollaborateur.site, onChange: (e) => setNewCollaborateur({ ...newCollaborateur, site: e.target.value }), className: 'w-full px-3 py-2 border rounded', placeholder: 'Site', required: true }),
              React.createElement('button', { onClick: ajouterCollaborateur, className: 'w-full bg-blue-600 text-white py-2 rounded' }, editingId ? 'Mettre à jour' : 'Ajouter')
            )
          ),
          React.createElement('div', { className: 'col-span-2' },
            React.createElement('div', { className: 'bg-white rounded shadow p-6' },
              React.createElement('div', { className: 'mb-4' },
                React.createElement('label', { className: 'font-medium mr-2' }, 'Site:'),
                React.createElement('select', { value: selectedSite, onChange: (e) => setSelectedSite(e.target.value), className: 'px-3 py-2 border rounded' },
                  sites.map(s => React.createElement('option', { key: s, value: s }, s))
                )
              ),
              React.createElement('div', { className: 'space-y-2' },
                getEmployesBySite().map(e => {
                  const nbConges = conges.filter(c => c.employe_id === e.id).length;
                  return React.createElement('div', { key: e.id, className: 'flex justify-between p-3 bg-gray-50 rounded' },
                    React.createElement('div', null,
                      React.createElement('p', { className: 'font-medium' }, e.nom),
                      React.createElement('p', { className: 'text-sm text-gray-600' }, `${e.role} • ${e.site}`)
                    ),
                    React.createElement('div', { className: 'flex gap-2' },
                      React.createElement('button', { onClick: () => { setNewCollaborateur(e); setEditingId(e.id); }, className: 'px-3 py-1 bg-yellow-100 text-sm rounded' }, '✎'),
                      React.createElement('button', { onClick: () => supprimerCollaborateur(e.id), className: 'px-3 py-1 bg-red-100 text-sm rounded' }, '🗑️')
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
      React.createElement('div', { className: 'max-w-4xl mx-auto px-6 py-4 flex justify-between' },
        React.createElement('div', null,
          React.createElement('h1', { className: 'text-2xl font-bold' }, 'Calendrier des Congés'),
          React.createElement('p', { className: 'text-sm text-gray-600' }, `📅 ${aujourd_hui.toLocaleDateString('fr-BE')}`)
        ),
        React.createElement('button', { onClick: () => setShowRHLogin(true), className: 'px-4 py-2 bg-blue-600 text-white rounded' }, 'RH')
      )
    ),
    React.createElement('div', { className: 'max-w-4xl mx-auto px-6 py-8' },
      React.createElement('div', { className: 'bg-white rounded shadow p-6 mb-6' },
        React.createElement('h2', { className: 'font-bold mb-4' }, `Absences du ${jourAffiche} ${monthName[moisActuel.getMonth()]}`),
        getAbsentsOfDay(jourAffiche).length === 0 ? React.createElement('p', { className: 'text-gray-500' }, 'Aucune') :
          getAbsentsOfDay(jourAffiche).map((a, i) => {
            const cfg = getTypeConfig(a.type);
            return React.createElement('div', { key: i, className: `flex gap-3 p-3 rounded border ${cfg.color} ${cfg.border}` },
              React.createElement('span', null, cfg.icon),
              React.createElement('div', null,
                React.createElement('p', { className: 'font-medium' }, a.employe.nom),
                React.createElement('p', { className: `text-sm ${cfg.text}` }, `${a.type}: ${a.dateDebut} → ${a.dateFin}`)
              )
            );
          })
      ),
      React.createElement('div', { className: 'bg-white rounded shadow p-8' },
        React.createElement('div', { className: 'flex justify-between items-center mb-6' },
          React.createElement('button', { onClick: () => setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() - 1, 1)) }, React.createElement(ChevronLeft)),
          React.createElement('div', null,
            React.createElement('h2', { className: 'text-2xl font-bold text-center' }, `${monthName[moisActuel.getMonth()]} ${moisActuel.getFullYear()}`),
            React.createElement('p', { className: 'text-sm text-gray-600 text-center' }, `Auj: ${aujourd_hui.getDate()}`)
          ),
          React.createElement('button', { onClick: () => setMoisActuel(new Date(moisActuel.getFullYear(), moisActuel.getMonth() + 1, 1)) }, React.createElement(ChevronRight))
        ),
        React.createElement('div', { className: 'grid grid-cols-7 gap-2 mb-4' },
          ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => React.createElement('div', { key: d, className: 'text-center font-bold py-2' }, d))
        ),
        React.createElement('div', { className: 'grid grid-cols-7 gap-2' },
          Array(getFirstDayOfMonth(moisActuel) === 0 ? 6 : getFirstDayOfMonth(moisActuel) - 1).fill(null).map((_, i) => React.createElement('div', { key: `e${i}` })),
          Array(getDaysInMonth(moisActuel)).fill(null).map((_, i) => {
            const day = i + 1;
            const congesDuJour = isDateInConges(day);
            const isToday = day === aujourd_hui.getDate() && moisActuel.getMonth() === aujourd_hui.getMonth();
            const cfg = congesDuJour.length > 0 ? getTypeConfig(congesDuJour[0].type) : null;
            
            return React.createElement('div', {
              key: day,
              onClick: () => setJourAffiche(day),
              className: `aspect-square rounded border-2 flex items-center justify-center font-semibold cursor-pointer ${
                isToday ? 'bg-green-100 border-green-400 ring-2 ring-green-300' :
                cfg ? cfg.color + ' ' + cfg.border : 'bg-gray-50 border-gray-200'
              }`
            },
              day,
              congesDuJour.length > 0 && React.createElement('span', { className: 'absolute text-xs bg-gray-600 text-white w-5 h-5 rounded-full flex items-center justify-center' }, congesDuJour.length)
            );
          })
        )
      )
    )
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(CongesApp));
