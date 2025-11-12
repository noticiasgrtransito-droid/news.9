(async function(){
  function nowStr(){const d=new Date();return d.toLocaleDateString()+' '+d.toLocaleTimeString();}
  function detectType(t){ t=(t||'').toLowerCase(); if(/acidente|capot|colis|colisão|colisao/i.test(t)) return 'Acidente'; if(/roubo|assalto/i.test(t)) return 'Roubo'; if(/furto/i.test(t)) return 'Furto'; if(/interdi|bloqueio|obra|manuten/i.test(t)) return 'Interdição'; if(/porto|navio|marítim|portu/i.test(t)) return 'Porto'; if(/sindic/i.test(t)) return 'Sindicato'; if(/internacional|foreign|overseas/i.test(t)) return 'Internacional'; return 'Outros'; }
  function detectRoad(t){ const m=(t||'').match(/BR[-\s]?\d{1,4}|SP[-\s]?\d{1,3}|RODOANEL/i); return m? m[0].toUpperCase().replace(' ','-') : ''; }
  function detectRegion(t){ t=(t||'').toLowerCase(); if(/s[oã]o paulo|sao paulo|minas gerais|rio de janeiro|espirito santo/i.test(t)) return 'Sudeste'; if(/paran[aá]|santa catarina|rio grande do sul/i.test(t)) return 'Sul'; if(/goias|mato grosso|distrito federal/i.test(t)) return 'Centro-Oeste'; if(/bahia|pernambuco|ceara|maranhao/i.test(t)) return 'Nordeste'; if(/acre|amazonas|roraima|rondonia/i.test(t)) return 'Norte'; return 'Outras'; }

  const loginBtn=document.getElementById('loginBtn'), userInp=document.getElementById('user'), passInp=document.getElementById('pass'), loginMsg=document.getElementById('loginMsg');
  function showApp(){document.getElementById('login-screen').style.display='none';document.getElementById('app').classList.remove('hidden');initApp();}
  loginBtn.addEventListener('click',()=>{const u=userInp.value.trim(),p=passInp.value.trim(); if(u==='adm' && p==='adm'){sessionStorage.setItem('congrl_auth','adm'); showApp(); } else {loginMsg.textContent='Usuário ou senha incorretos'; setTimeout(()=>loginMsg.textContent='',2500);} });
  if(sessionStorage.getItem('congrl_auth')==='adm'){showApp();}

  let allFeeds=[], filtered=[], map, markersLayer, chartTypes, chartRegions;

  async function initApp(){
    document.getElementById('now').textContent = nowStr(); setInterval(()=>document.getElementById('now').textContent = nowStr(), 1000);

    const roadSel = document.getElementById('roadFilter');
    const roads = await fetch('data/rodovias.json').then(r=>r.json()).catch(()=>[]);
    roads.forEach(r=>{ const o=document.createElement('option'); o.value=r; o.textContent=r; roadSel.appendChild(o); });

    const concessions = await fetch('data/concessionarias.json').then(r=>r.json()).catch(()=>[]);
    const concesList = document.getElementById('concessList');
    concesList.innerHTML = concessions.map(c=>`<div class="concess" data-site="${c.site}">${c.name}</div>`).join('');
    concesList.addEventListener('click', (e)=>{ const el = e.target.closest('.concess'); if(el && el.dataset.site) window.open(el.dataset.site,'_blank'); });

    const phones = [
      {"name":"Corpo de Bombeiros","site":"https://www.corpodebombeiros.sp.gov.br/#/","tel":"193"},
      {"name":"Polícia Civil","site":"https://www.policiacivil.sp.gov.br/portal/faces/pages_home","tel":"181"},
      {"name":"Polícia Militar","site":"https://www.policiamilitar.sp.gov.br/","tel":"190"},
      {"name":"SAMU","site":"https://samues.com.br/","tel":"192"},
      {"name":"PRF","site":"https://www.prf.gov.br","tel":"191"},
      {"name":"Defesa Civil","site":"https://www.defesacivil.sp.gov.br/","tel":"199"},
      {"name":"DETRAN-SP","site":"https://www.detran.sp.gov.br/detransp","tel":""},
      {"name":"ANTT (Consulta RNTRC)","site":"https://consultapublica.antt.gov.br/Site/ConsultaRNTRC.aspx","tel":""}
    ];
    document.getElementById('phonesList').innerHTML = phones.map(p=>`<div class="concess">${p.site?`<a href="${p.site}" target="_blank">${p.name}${p.tel? ' — '+p.tel:''}</a>`:p.name}</div>`).join('');

    const ctxTypes = document.getElementById('chartTypes').getContext('2d');
    const ctxRegions = document.getElementById('chartRegions').getContext('2d');
    chartTypes = new Chart(ctxTypes, { type:'bar', data:{ labels:[], datasets:[{ label:'Ocorrências', data:[], backgroundColor:'#0d47a1' }] }, options:{ maintainAspectRatio:false } });
    chartRegions = new Chart(ctxRegions, { type:'doughnut', data:{ labels:[], datasets:[{ data:[], backgroundColor:['#0d47a1','#1976d2','#42a5f5','#90caf9','#64b5f6'] }] }, options:{ maintainAspectRatio:false } });

    initMap();

    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('regionFilter').addEventListener('change', applyFilters);
    document.getElementById('roadFilter').addEventListener('change', applyFilters);
    document.getElementById('refreshBtn').addEventListener('click', async ()=>{ document.getElementById('refreshBtn').textContent='Atualizando...'; document.getElementById('refreshBtn').disabled=true; await loadAndRender(); document.getElementById('refreshBtn').disabled=false; document.getElementById('refreshBtn').textContent='Atualizar'; });
    document.getElementById('csvBtn').addEventListener('click', downloadCSV);
    document.getElementById('pdfBtn').addEventListener('click', generatePDF);

    document.getElementById('fontesBtn').addEventListener('click', ()=>{ const used = JSON.parse(localStorage.getItem('congrl_used_sources')||'[]'); const list = document.getElementById('fontesList'); list.innerHTML = used.map(u=>`<div style="padding:6px;border-bottom:1px solid #eee">${u}</div>`).join('') || '<div style="padding:6px">Nenhuma fonte</div>'; document.getElementById('fontesModal').style.display='block'; });
    document.getElementById('fontesBuscaBtn').addEventListener('click', ()=>{ const fixed = ['G1 (RSS)','G1 Cidades','Google News (RSS)','R7','CNN','UOL','Estadão','PRF','DNIT','CCR','Arteris','Concessionárias locais']; document.getElementById('fixedSources').innerHTML = fixed.map(f=>`<li>${f}</li>`).join(''); document.getElementById('fontesBuscaModal').style.display='block'; });
    document.getElementById('ajudaBtn').addEventListener('click', ()=>{ document.getElementById('ajudaBody').innerHTML = '<p>Use filtros para limitar resultados (Ocorrência, Região, Rodovia). Clique em Atualizar para forçar recarga. CSV e PDF exportam relatórios. O mapa mostra ocorrências com ícones (A=Acidente, I=Interdição, R=Roubo, F=Furto).</p>'; document.getElementById('ajudaModal').style.display='block'; });
    document.querySelectorAll('.close, .btn-close').forEach(b=> b.addEventListener('click', e=> document.getElementById(e.target.dataset.for).style.display='none'));

    loadWeather();
    await loadAndRender();
    setInterval(async ()=>{ await loadAndRender(); }, 1000*60*30);
  }

  function initMap(){ if(map) return; map = L.map('map',{ scrollWheelZoom:false }).setView([-14.2350,-51.9253],4); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution: '© OpenStreetMap contributors' }).addTo(map); markersLayer = L.layerGroup().addTo(map); document.getElementById('expandMap').addEventListener('click', ()=> window.open('map.html','_blank')); }

  async function fetchFeeds(){ try { const local = await fetch('data/mock_data.json').then(r=>r.json()).catch(()=>null); let items = local || []; items = items.map(it=>{ it.type = it.type || detectType(it.title + ' ' + (it.snippet||'')); it.road = it.road || detectRoad(it.title + ' ' + (it.snippet||'')); it.region = it.region || detectRegion(it.title + ' ' + (it.snippet||'')); return it; }); localStorage.setItem('congrl_cache', JSON.stringify({ items: items, fetched: new Date().toISOString() })); localStorage.setItem('congrl_used_sources', JSON.stringify(Array.from(new Set(items.map(i=>i.source||'local'))))); return items; } catch(err){ console.error('fetchFeeds error', err); return []; } }

  async function loadAndRender(){ allFeeds = await fetchFeeds(); allFeeds.sort((a,b)=> new Date(b.pubDate||b.date||0) - new Date(a.pubDate||a.date||0)); document.getElementById('lastFetch').textContent = new Date().toLocaleString(); applyFilters(); }

  function applyFilters(){ const type = document.getElementById('typeFilter').value || ''; const region = document.getElementById('regionFilter').value || ''; const road = document.getElementById('roadFilter').value || ''; const q = document.getElementById('search').value.trim().toLowerCase(); filtered = allFeeds.filter(it=>{ if(type && ((it.type||'').toLowerCase() !== type.toLowerCase())) return false; if(region && ((it.region||'').toLowerCase() !== region.toLowerCase())) return false; if(road){ const r = (it.road||'').toUpperCase(); if(!r.includes(road.toUpperCase())) return false; } if(q){ const hay = (it.title+' '+(it.snippet||'')+' '+(it.source||'')).toLowerCase(); if(!hay.includes(q)) return false; } return true; }); renderNews(filtered); updateStatsAndCharts(filtered); updateMapMarkers(filtered); }

  function renderNews(list){ const newsList = document.getElementById('newsList'); newsList.innerHTML = ''; if(!list || list.length===0){ newsList.innerHTML = '<div class="card">Nenhuma notícia encontrada.</div>'; return; } list.forEach(it=>{ const time = it.pubDate ? new Date(it.pubDate) : null; const timestr = time ? (time.toLocaleDateString() + ' ' + time.toLocaleTimeString()) : ''; const div = document.createElement('div'); div.className='news-item'; const link = `<a href="${it.link||'#'}" target="_blank" rel="noopener">${escapeHtml(it.title||'(sem título)')}</a>`; div.innerHTML = `<div style="flex:1;min-width:220px"><span class="meta">[${it.type||'Outros'}] ${it.road? '— '+it.road : ''}</span> ${link}</div><div class="meta">${escapeHtml(it.source||'')} • ${timestr}</div>`; div.addEventListener('click', ()=>{ if(it.lat && it.lon){ initMap(); map.setView([it.lat,it.lon],11); L.popup().setLatLng([it.lat,it.lon]).setContent(`<strong>${escapeHtml(it.title)}</strong><br><a href='${it.link}' target='_blank'>Abrir fonte</a>`).openOn(map); } }); newsList.appendChild(div); }); }

  function updateStatsAndCharts(list){ const typesCount = {}, regionsCount = {}; list.forEach(f=>{ typesCount[f.type] = (typesCount[f.type]||0) + 1; regionsCount[f.region] = (regionsCount[f.region]||0) + 1; }); document.getElementById('statAcc').textContent = typesCount['Acidente'] || 0; document.getElementById('statInt').textContent = (typesCount['Interdição'] || 0) + (typesCount['Trânsito'] || 0); document.getElementById('statRoubo').textContent = typesCount['Roubo'] || 0; document.getElementById('statFurto').textContent = typesCount['Furto'] || 0; chartTypes.data.labels = Object.keys(typesCount); chartTypes.data.datasets[0].data = Object.values(typesCount); chartTypes.update(); chartRegions.data.labels = Object.keys(regionsCount); chartRegions.data.datasets[0].data = Object.values(regionsCount); chartRegions.update(); }

  function updateMapMarkers(list){ if(!map) initMap(); markersLayer.clearLayers(); list.forEach(it=>{ if(!it.lat || !it.lon) return; const emoji = it.type==='Acidente'?'A':(it.type==='Interdição'?'I':(it.type==='Roubo'?'R':(it.type==='Furto'?'F':'O'))); const icon = L.divIcon({ html:`<div style="background:#0d47a1;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center">${emoji}</div>`, className:'' }); L.marker([it.lat,it.lon], { icon }).addTo(markersLayer).bindPopup(`<strong>${escapeHtml(it.title)}</strong><br><a href='${it.link}' target='_blank'>Abrir fonte</a>`); }); const pts = list.filter(i=>i.lat&&i.lon).map(i=>L.latLng(i.lat,i.lon)); if(pts.length){ try{ const g = L.featureGroup(pts.map(p=>L.marker(p))); map.fitBounds(g.getBounds().pad(0.2)); }catch(e){} } }

  function downloadCSV(){ const source = (filtered && filtered.length>0) ? filtered : allFeeds; const rows = []; rows.push(['Notícia','Data','Hora','Link','Ocorrência','Rodovia','Região'].join(';')); source.forEach(f=>{ const d = f.pubDate ? new Date(f.pubDate) : new Date(); const date = d.toLocaleDateString(); const time = d.toLocaleTimeString(); const title = (f.title||'').replace(/"/g,'""'); const link = (f.link||'').replace(/"/g,'""'); const line = [`"${title}"`, `"${date}"`, `"${time}"`, `"${link}"`, `"${f.type||''}"`, `"${f.road||''}"`, `"${f.region||''}"`].join(';'); rows.push(line); }); const csv = rows.join('\r\n'); const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'news_export.csv'; a.click(); URL.revokeObjectURL(url); }

  async function generatePDF(){ try{ const { jsPDF } = window.jspdf; const doc = new jsPDF({unit:'pt', format:'letter'}); doc.setFontSize(14); doc.text('TORRES - Central Operacional News (CON)',40,40); doc.setFontSize(10); doc.text('Relatório gerado em: ' + new Date().toLocaleString(),40,60); let y = 90; const source = (filtered && filtered.length>0) ? filtered : allFeeds; source.slice(0,30).forEach((f,i)=>{ doc.setFontSize(11); doc.text((i+1)+'. '+(f.title||''),40,y); y+=14; doc.setFontSize(9); doc.text('Fonte: '+(f.source||'')+'  |  Tipo: '+(f.type||'' )+'  |  Link: '+(f.link||''),40,y); y+=18; if(y>720){ doc.addPage(); y=40; } }); doc.save('CON_report.pdf'); }catch(e){ alert('Erro ao gerar PDF: '+e.message); } }

  async function loadWeather(){ const el = document.getElementById('weather'); try{ const lat=-23.55, lon=-46.63; const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`); if(!res.ok) throw new Error('weather fail'); const data = await res.json(); if(data.current_weather){ const temp = data.current_weather.temperature; const wind = data.current_weather.windspeed; el.innerHTML = `<div>Temperatura: ${temp}°C</div><div>Vento: ${wind} km/h</div>`; } else el.textContent='Previsão indisponível'; }catch(e){ console.warn('weather',e); el.textContent='Erro ao carregar previsão'; } }

  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

})();