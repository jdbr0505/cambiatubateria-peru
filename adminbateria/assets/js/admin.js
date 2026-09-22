let API_BASE = '/adminbateria/backend/api';
function setApiBase(b){ API_BASE = b; const el = document.getElementById('apiBase'); if (el) el.textContent = b; }

// ============================================================================
// PROTECCIÓN CSRF
//
// Los endpoints de escritura exigen la cabecera X-CSRF-Token. Este panel hace
// peticiones desde una decena de sitios distintos sin un helper central, así
// que en vez de tocar cada llamada se intercepta fetch una sola vez: cualquier
// escritura al mismo origen sale con el token puesto.
//
// El token lo emite login.php y se guarda solo en memoria — nunca en
// localStorage, donde cualquier script inyectado en la página podría leerlo.
// ============================================================================
let CSRF_TOKEN = null;

/** @param {string|null} token */
function setCsrfToken(token){ CSRF_TOKEN = token || null; }

/** Pide el token al servidor. Devuelve false si la sesión no es válida. */
async function refreshCsrfToken(){
  try {
    const r = await fetch(`${API_BASE}/login.php`, { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    if (j?.csrf) { setCsrfToken(j.csrf); return true; }
  } catch { /* sin conexión: se reintenta en la próxima escritura */ }
  return false;
}

(function installCsrfInterceptor(){
  const originalFetch = window.fetch.bind(window);
  const MUTANTES = ['POST', 'PUT', 'PATCH', 'DELETE'];

  window.fetch = async function(input, init = {}){
    const metodo = (init.method || 'GET').toUpperCase();
    if (!MUTANTES.includes(metodo)) return originalFetch(input, init);

    // Solo al propio servidor: nunca se filtra el token a un tercero.
    const url = typeof input === 'string' ? input : input?.url ?? '';
    const esMismoOrigen = url.startsWith('/') || url.startsWith(location.origin);
    if (!esMismoOrigen) return originalFetch(input, init);

    if (!CSRF_TOKEN) await refreshCsrfToken();

    const conToken = {
      ...init,
      credentials: 'same-origin',
      headers: { ...(init.headers || {}), ...(CSRF_TOKEN ? { 'X-CSRF-Token': CSRF_TOKEN } : {}) },
    };

    let respuesta = await originalFetch(input, conToken);

    // Un 403 suele significar token vencido (la sesión se rotó o expiró).
    // Se renueva y se reintenta una sola vez, para que el administrador no
    // pierda lo que estaba guardando.
    if (respuesta.status === 403 && await refreshCsrfToken()) {
      respuesta = await originalFetch(input, {
        ...conToken,
        headers: { ...(init.headers || {}), 'X-CSRF-Token': CSRF_TOKEN },
      });
    }
    return respuesta;
  };
})();

async function detectApiBase(){
  const candidates = [];
  // current
  candidates.push(API_BASE);
  // relative to current directory
  candidates.push(new URL('./backend/api', location.href).pathname);
  // root-level common
  candidates.push('/backend/api');
  // try parent folder pattern
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length){ candidates.push('/'+parts[0]+'/backend/api'); }
  for (const base of candidates){
    try{
      const url = new URL(base + '/ping_db.php', location.href);
      const r = await fetch(url.toString(), { cache:'no-store' });
      if (r.ok){ setApiBase(base); return base; }
    }catch(_){ /* try next */ }
  }
  // fallback to first
  setApiBase(candidates[0]);
  return API_BASE;
}

function qs(sel, root=document){ return root.querySelector(sel); }

// ---- Picker de vehículos para nuevo producto ----
function bindPickVehicles(){
  const btnOpen = qs('#btnPickVehicles');
  const modal = qs('#modalPickVehicles');
  const btnClose = qs('#pvClose');
  const btnCancel = qs('#pvCancel');
  const btnApply = qs('#pvApply');
  const btnSearch = qs('#pvSearch');
  if (!modal) return;
  const open = () => { modal.classList.add('open'); document.body.classList.add('modal-open'); PICK_VEH.selected = PICK_VEH.selected || new Set(); loadPickVehiclesList(); };
  const close = () => { modal.classList.remove('open'); document.body.classList.remove('modal-open'); };
  if (btnOpen) btnOpen.onclick = open;
  if (btnClose) btnClose.onclick = close;
  if (btnCancel) btnCancel.onclick = close;
  if (btnSearch) btnSearch.onclick = loadPickVehiclesList;
  if (btnApply) btnApply.onclick = () => { close(); };
}

async function loadPickVehiclesList(){
  const grid = qs('#pvList'); const st = qs('#pvStatus'); if (!grid) return;
  const brand = (qs('#pvFilterBrand')?.value||'').trim();
  const model = (qs('#pvFilterModel')?.value||'').trim();
  const year  = (qs('#pvFilterYear')?.value||'').trim();
  const q = new URLSearchParams(); if (brand) q.set('brand', brand); if (model) q.set('model', model); if (year) q.set('year', year);
  try{
    st.textContent = 'Cargando...';
    // Usar vehículos de la sección "Vehículos asociados"
    const d = await jget('/vehiculos_asociados.php' + (q.toString()? ('?'+q.toString()):''));
    const items = d.items || [];
    grid.innerHTML = '';
    items.forEach(v => {
      const card = ce('div', { className:'card item' });
      const id = Number(v.id);
      const chk = ce('input', { type:'checkbox' });
      if (PICK_VEH.selected?.has(id)) chk.checked = true;
      chk.addEventListener('change', () => { if (chk.checked) PICK_VEH.selected.add(id); else PICK_VEH.selected.delete(id); updatePickStatus(); });
      const row = ce('div', { className:'row' });
      const text = ce('div'); text.innerHTML = `<strong>${v.brand||''} ${v.model||''}</strong> <span class="muted">${v.yearFrom||''}${v.yearTo?(' - '+v.yearTo):''}</span>`;
      row.appendChild(chk); row.appendChild(text);
      card.appendChild(row);
      grid.appendChild(card);
    });
    updatePickStatus();
  }catch(e){ console.error(e); st.textContent='Error al cargar'; st.className='status err'; }
}

function updatePickStatus(){ const st = qs('#pvStatus'); if (st){ st.textContent = `${(PICK_VEH.selected||new Set()).size} vehículo(s) seleccionado(s)`; st.className='muted'; } }

// ---- Usuarios ----
async function loadUsers(){
  const grid = qs('#usersGrid'); if (!grid) return;
  try{
    const d = await jget('/usuarios.php');
    renderUsers(d.users || []);
  }catch(e){ grid.innerHTML = '<div class="muted">No se pudieron cargar usuarios</div>'; }
}

function renderUsers(users){
  const grid = qs('#usersGrid'); if (!grid) return; grid.innerHTML = '';
  users.forEach(u => {
    const card = ce('div', { className:'card item' });
    card.innerHTML = `
      <div class="row">
        <label>Usuario
          <input data-k="username" type="text" value="${u.username||''}">
        </label>
        <label>Nombre
          <input data-k="nombre" type="text" value="${u.nombre||''}">
        </label>
        <label>Email
          <input data-k="email" type="email" value="${u.email||''}">
        </label>
        <label>Rol
          <select data-k="rol">
            <option value="admin" ${u.rol==='admin'?'selected':''}>admin</option>
            <option value="editor" ${u.rol==='editor'?'selected':''}>editor</option>
            <option value="tecnico" ${u.rol==='tecnico'?'selected':''}>tecnico</option>
          </select>
        </label>
        <label>Nueva contraseña
          <input data-k="new_password" type="password" placeholder="(opcional)" autocomplete="new-password">
        </label>
        <label>Activo
          <input data-k="activo" type="checkbox" ${u.activo?'checked':''}>
        </label>
        <div class="actions">
          <button class="btn sm" data-action="save">Guardar</button>
          <button class="btn sm danger" data-action="delete">Eliminar</button>
        </div>
      </div>
      <div class="status" data-k="status"></div>
    `;
    card.addEventListener('click', async (e) => {
      const act = e.target?.dataset?.action; if (!act) return;
      const get = k => card.querySelector(`[data-k="${k}"]`);
      const st = get('status');
      if (act === 'save'){
        const payload = {
          id: u.id,
          username: get('username')?.value?.trim() || null,
          nombre: get('nombre')?.value?.trim() || null,
          email: get('email')?.value?.trim() || null,
          rol: get('rol')?.value || 'admin',
          activo: get('activo')?.checked || false,
        };

        const np = get('new_password')?.value || '';
        if (np) payload.new_password = np;
        try{ if (st){ st.textContent='Guardando...'; st.className='status'; }
          await jput('/usuarios.php', payload);
          if (st){ st.textContent='Guardado'; st.className='status ok'; }
          loadUsers();
        }catch(err){ if (st){ st.textContent = 'Error: ' + (err?.message||''); st.className='status err'; } }
      }else if (act === 'delete'){
        if (!(await showConfirm('¿Eliminar este usuario?', 'Eliminar'))) return;
        try{ if (st){ st.textContent='Eliminando...'; st.className='status'; }
          await jdel(`/usuarios.php?id=${u.id}`);
          loadUsers();
        }catch(err){ if (st){ st.textContent='Error: ' + (err?.message || 'sin conexión'); st.className='status err'; } }
      }
    });
    grid.appendChild(card);
  });
}

function bindUsers(){
  const btn = qs('#btnAddUser'); if (!btn) return;
  btn.addEventListener('click', async () => {
    const st = qs('#usAddStatus'); if (st){ st.textContent='Agregando...'; st.className='status'; }
    const nombre = qs('#usNombre')?.value?.trim() || null;
    const username = qs('#usUsername')?.value?.trim() || '';
    const email = qs('#usEmail')?.value?.trim() || null;
    const rol = qs('#usRol')?.value || 'admin';
    const password = qs('#usPassword')?.value || '';
    const activo = qs('#usActivo')?.checked || false;
    try{
      await jpost('/usuarios.php', { nombre, username, email, rol, password, activo });
      if (st){ st.textContent='Agregado'; st.className='status ok'; }
      // limpiar
      if (qs('#usNombre')) qs('#usNombre').value = '';
      if (qs('#usUsername')) qs('#usUsername').value = '';
      if (qs('#usEmail')) qs('#usEmail').value = '';
      if (qs('#usPassword')) qs('#usPassword').value = '';
      if (qs('#usActivo')) qs('#usActivo').checked = true;
      loadUsers();
    }catch(e){ if (st){ st.textContent='Error: '+(e?.message||''); st.className='status err'; } }
  });
}

// ---- Vehículos asociados ----
async function loadAssociations(){
  const grid = qs('#assocGrid'); if (!grid) return;
  const brand = (qs('#assocFilterBrand')?.value||'').trim();
  const model = (qs('#assocFilterModel')?.value||'').trim();
  const year = (qs('#assocFilterYear')?.value||'').trim();
  const q = new URLSearchParams(); if (brand) q.set('brand', brand); if (model) q.set('model', model); if (year) q.set('year', year);
  try{
    const data = await jget('/vehiculos_asociados.php' + (q.toString()? ('?'+q.toString()):''));
    renderAssociations(data.items||[]);
  }catch(e){ console.error(e); }
}

// Estado del modal de asociaciones
let ASSOC_MODAL = { vehicleId: null, products: [], selected: new Set() };
// Selección de vehículos para nuevo producto
let PICK_VEH = { selected: new Set() };

function openAssocModal(vehicle){
  ASSOC_MODAL.vehicleId = vehicle.id;
  ASSOC_MODAL.selected = new Set();
  const modal = qs('#modalAssociate'); if (!modal) return;
  qs('#assocModalTitle').textContent = `Asociar productos · ${vehicle.brand||''} ${vehicle.model||''}`;
  qs('#assocSearch').value = '';
  qs('#assocStatus').textContent = '';
  qs('#assocList').innerHTML = '';
  // Quitar cualquier display inline que impida mostrarse y luego centrar con la clase 'open'
  modal.style.display = '';
  modal.classList.add('open');
  // llenar marcas en el selector
  (async () => {
    try{
      const d = await jget('/marcas.php');
      const sel = qs('#assocBrandSel');
      if (sel){
        const rows = d.rows||[];
        sel.innerHTML = ['<option value="">Todas</option>'].concat(rows.map(r => `<option value="${r.nombre}">${r.nombre}</option>`)).join('');
        sel.onchange = loadAssocProducts;
      }
    }catch(_){ /* ignore */ }
  })();
  loadAssocProducts();
}

function closeAssocModal(){ const modal = qs('#modalAssociate'); if (modal){ modal.classList.remove('open'); modal.style.display = ''; } }

async function loadAssocProducts(){
  const list = qs('#assocList'); const st = qs('#assocStatus');
  const term = (qs('#assocSearch')?.value||'').trim();
  const sel = qs('#assocBrandSel');
  const brand = sel ? (sel.value||'') : '';
  try{
    st.textContent = 'Cargando...';
    // cargar productos (con búsqueda)
    const q = new URLSearchParams(); if (term) q.set('q', term); if (brand) q.set('brand', brand);
    const d = await jget('/productos.php' + (q.toString()? ('?'+q.toString()):''));
    ASSOC_MODAL.products = d.products || [];
    // cargar asociados actuales
    const cur = await jget(`/vehiculos_asociados.php?assoc_for=${ASSOC_MODAL.vehicleId}`);
    ASSOC_MODAL.selected = new Set(cur.product_ids||[]);
    // Render checkboxes agrupados por marca
    list.innerHTML = '';
    const groups = ASSOC_MODAL.products.reduce((acc, p) => {
      const key = (p.brand || 'Sin marca').toString();
      (acc[key] = acc[key] || []).push(p);
      return acc;
    }, {});
    const brands = Object.keys(groups).sort((a,b) => a.localeCompare(b));
    const frag = document.createDocumentFragment();
    brands.forEach(br => {
      const section = ce('div', { className:'assoc-brand-section' });
      const title = ce('h4', { textContent: br });
      const gridWrap = ce('div', { className:'assoc-grid' });
      section.appendChild(title);
      section.appendChild(gridWrap);
      groups[br].forEach(p => {
        const chip = ce('label', { className:'assoc-chip' });
        const chk = ce('input'); chk.type='checkbox'; chk.value = p.id; chk.checked = ASSOC_MODAL.selected.has(p.id);
        chk.addEventListener('change', () => {
          const id = Number(chk.value);
          if (chk.checked) ASSOC_MODAL.selected.add(id); else ASSOC_MODAL.selected.delete(id);
          st.textContent = `${ASSOC_MODAL.selected.size} seleccionado(s)`;
        });
        const info = ce('div', { className:'assoc-info' });
        info.innerHTML = `<strong>${p.name}</strong><div class="muted">${p.brand||''}</div>`;
        chip.appendChild(chk); chip.appendChild(info);
        gridWrap.appendChild(chip);
      });
      frag.appendChild(section);
    });
    list.appendChild(frag);
    st.textContent = `${ASSOC_MODAL.selected.size} seleccionado(s)`;
  }catch(e){ st.textContent = 'Error al cargar'; }
}

async function saveAssocProducts(){
  const st = qs('#assocStatus'); st.textContent = 'Guardando...';
  const ids = [...ASSOC_MODAL.selected];
  try{
    await jput('/vehiculos_asociados.php', { vehiculo_id: ASSOC_MODAL.vehicleId, product_ids: ids });
    st.textContent = 'Guardado'; st.className='status ok';
    closeAssocModal();
    loadAssociations();
  }catch(e){ st.textContent = 'Error al guardar'; st.className='status err'; }
}

function renderAssociations(items){
  const grid = qs('#assocGrid'); if (!grid) return; grid.innerHTML='';
  items.forEach(v => {
    const card = ce('div', { className:'card' });
    const title = ce('div'); title.innerHTML = `<strong>${v.brand||''} ${v.model||''}</strong> · <span class="muted">${v.yearFrom||''}${v.yearTo?(' - '+v.yearTo):''}</span>`;
    const info = ce('div', { className:'muted' });
    const extra = [v.engine||'', v.trim||''].filter(Boolean).join(' · ');
    info.textContent = `${extra}${extra? ' · ':''}${(v.productCount||0)} producto(s)`;
    const actions = ce('div', { className:'actions' });
    const btn = ce('button', { className:'btn', textContent:'Asociar productos' });
    btn.onclick = () => openAssocModal(v);

    actions.appendChild(btn);
    card.appendChild(title); card.appendChild(info); card.appendChild(actions);
    grid.appendChild(card);
  });
}

// ---- Productos listado dentro de Productos tab ----
async function loadProducts2(){
  const grid = qs('#productsGrid2'); if (!grid) return; grid.innerHTML = '';
  const brandSel = qs('#listBrand2');
  const brand = (brandSel?.value||'') === 'Todas' ? '' : (brandSel?.value||'');
  const q = new URLSearchParams(); if (brand) q.set('brand', brand);
  const data = await jget('/productos.php' + (q.toString()? ('?'+q.toString()):''));

  const products = data.products||[];
  const groups = products.reduce((acc, p) => {
    const key = p.brand || 'Sin marca';
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});
  const brands = Object.keys(groups).sort((a,b) => a.localeCompare(b));
  brands.forEach(br => {
    const section = ce('div', { className:'card brand-section' });
    const title = ce('h4', { textContent: br }); section.appendChild(title);
    const row = ce('div', { className:'brand-products-row' });
    (groups[br]||[]).forEach(p => {
      const chip = ce('div', { className:'product-chip' });
      const info = ce('div', { className:'chip-info' });
      info.innerHTML = `<strong>${p.name}</strong><span class="muted">S/ ${(p.price||0).toLocaleString('es-PE')}</span>`;
      const del = ce('button', { className:'btn sm danger', textContent:'Eliminar' });
      del.addEventListener('click', async () => {
        if (!(await showConfirm('¿Eliminar este producto?', 'Eliminar'))) return;
        try{ await jdel(`/productos.php?id=${p.id}`); loadProducts2(); }
        catch(e){ alert('No se pudo eliminar: '+(e?.message||'')); }
      });
      chip.appendChild(info); chip.appendChild(del);
      row.appendChild(chip);
    });
    section.appendChild(row);
    grid.appendChild(section);
  });
}

function bindAssociations(){
  const btn = qs('#btnAssocSearch'); if (btn) btn.addEventListener('click', loadAssociations);
  // modal controls
  const mClose = qs('#assocClose'); if (mClose) mClose.addEventListener('click', closeAssocModal);
  const mCancel = qs('#assocCancel'); if (mCancel) mCancel.addEventListener('click', closeAssocModal);
  const mSave = qs('#assocSave'); if (mSave) mSave.addEventListener('click', saveAssocProducts);
  const mSearch = qs('#assocSearch'); if (mSearch) mSearch.addEventListener('input', () => { clearTimeout(mSearch._t); mSearch._t = setTimeout(loadAssocProducts, 300); });
  const mRefresh = qs('#assocRefresh'); if (mRefresh) mRefresh.addEventListener('click', loadAssocProducts);
}
function ce(tag, props={}){ const el = document.createElement(tag); Object.assign(el, props); return el; }

// ---- Modal Edición de Marca ----
const BRAND_EDIT = { oldName:null, name:null, logo:null };
function showBrandModal(show){ const m = qs('#modalBrandEdit'); if (!m) return; m.classList.toggle('open', !!show); document.body.classList.toggle('modal-open', !!show); }
function openBrandModal(row){
  BRAND_EDIT.oldName = row?.nombre || '';
  BRAND_EDIT.name = row?.nombre || '';
  BRAND_EDIT.logo = row?.logo_path || '';
  const name = qs('#beName'); const prev = qs('#bePreview'); const st = qs('#beStatus');
  if (name) name.value = BRAND_EDIT.name || '';
  if (prev){ prev.src = BRAND_EDIT.logo || ''; prev.style.display = BRAND_EDIT.logo? 'block':'none'; }
  if (st){ st.textContent=''; st.className='status'; }
  bindBrandModalOnce();
  showBrandModal(true);
}
function bindBrandModalOnce(){
  if (bindBrandModalOnce._done) return; bindBrandModalOnce._done = true;
  const file = qs('#beFile'); const upBtn = qs('#beUploadBtn'); const prev = qs('#bePreview');
  const save = qs('#beSave'); const cancel = qs('#beCancel'); const name = qs('#beName'); const st = qs('#beStatus');
  if (upBtn && file){ upBtn.onclick = () => file.click(); }
  if (file){ file.onchange = async () => {
    const f = file.files?.[0]; if(!f) return;
    try{
      if (st){ st.textContent='Subiendo...'; st.className='status'; }
      const fd = new FormData(); fd.append('archivo', f); fd.append('tipo','marca'); fd.append('nombre', (name?.value||BRAND_EDIT.name||'marca'));
      const r = await fetch(`${API_BASE}/upload.php`, { method:'POST', body: fd }); const j = await r.json(); if(!r.ok||!j.success) throw new Error(j?.error||'Error');
      BRAND_EDIT.logo = j.ruta || '';
      if (prev){ prev.src = BRAND_EDIT.logo; prev.style.display = BRAND_EDIT.logo? 'block':'none'; }
      if (st){ st.textContent='Logo actualizado (sin guardar)'; st.className='status ok'; }
    }catch(e){ if (st){ st.textContent='Error: ' + (e?.message || 'sin conexión'); st.className='status err'; } }
  }; }
  if (cancel){ cancel.onclick = () => showBrandModal(false); }
  if (save){ save.onclick = async () => {
    const newName = (name?.value||'').trim();
    if (st){ st.textContent='Guardando...'; st.className='status'; }
    try{
      // Renombrar si cambió
      if (newName && newName !== BRAND_EDIT.oldName){ await jput('/marcas.php', { old: BRAND_EDIT.oldName, new: newName }); BRAND_EDIT.oldName = newName; }
      // Actualizar logo si hay uno nuevo
      if (BRAND_EDIT.logo){ await jpost('/marcas.php', { name: BRAND_EDIT.oldName || newName, logo_path: BRAND_EDIT.logo }); }
      if (st){ st.textContent='Guardado'; st.className='status ok'; }
      showBrandModal(false); loadBrands();
    }catch(e){ if (st){ st.textContent='Error: '+(e?.message||''); st.className='status err'; } }
  }; }
}
// ---- Fotos de página ----
//
// Slots fijos, uno por cada <img data-foto-slug="..."> que existe hoy en el
// sitio público (pagina-fotos.js). Reemplazan la sección "Vehículos Premium":
// premium.html ya no existe, y esos formularios no tenían efecto en ninguna
// página real.
const FOTOS_SLOTS = [
  { slug: 'hero', label: 'Portada — Inicio', pagina: 'index.html', descripcion: 'Foto principal junto al título de la portada.' },
  { slug: 'catalogo', label: 'Fondo del buscador — Catálogo', pagina: 'catalogo.html', descripcion: 'Foto de fondo detrás del buscador de compatibilidad. Por defecto es la misma de la portada.' },
  { slug: 'servicios', label: 'Cómo trabajamos — Servicios', pagina: 'servicios.html', descripcion: 'Foto vertical junto al texto de la izquierda.' },
  { slug: 'cobertura', label: 'Banner — Cobertura', pagina: 'cobertura.html', descripcion: 'Banner sobre la lista de distritos.' },
  { slug: 'nosotros', label: 'El equipo — Nosotros', pagina: 'nosotros.html', descripcion: 'Foto junto a "Técnicos certificados, no un chico en moto".' },
  { slug: 'contacto', label: 'Banner — Contacto', pagina: 'contacto.html', descripcion: 'Banner sobre las tarjetas de teléfono/WhatsApp/correo.' },
];

async function loadFotos(){
  const grid = qs('#fotosGrid'); if (!grid) return;
  const status = qs('#fotosStatus');
  if (status){ status.textContent = 'Cargando...'; status.className = 'status'; }
  try{
    const d = await jget('/pagina_fotos.php');
    renderFotos(d.items || {});
    if (status){ status.textContent = ''; status.className = 'status'; }
  }catch(e){
    grid.innerHTML = '';
    grid.appendChild(ce('div', { className: 'muted', textContent: 'No se pudieron cargar las fotos' }));
    if (status){ status.textContent = 'Error'; status.className = 'status err'; }
  }
}

function renderFotos(items){
  const grid = qs('#fotosGrid'); if (!grid) return; grid.innerHTML = '';

  FOTOS_SLOTS.forEach((slot) => {
    const actual = items[slot.slug] || null;
    let currentPath = actual?.path || '';
    const card = ce('div', { className: 'card' });

    const row1 = ce('div', { className: 'row', style: 'align-items:center;gap:12px' });
    const img = ce('img', {
      src: currentPath,
      alt: actual?.alt || slot.label,
      style: 'width:120px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;background:#f1f5f9',
    });
    if (!currentPath) img.style.visibility = 'hidden';
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });

    const info = ce('div');
    info.appendChild(ce('strong', { textContent: slot.label }));
    info.appendChild(document.createElement('br'));
    info.appendChild(ce('span', { className: 'muted', textContent: `${slot.pagina} — ${slot.descripcion}` }));
    row1.appendChild(img);
    row1.appendChild(info);
    card.appendChild(row1);

    const row2 = ce('div', { className: 'row', style: 'margin-top:10px;flex-wrap:wrap' });
    const inAlt = ce('input', { type: 'text', value: actual?.alt || '', placeholder: 'Texto alternativo (describe la foto)' });
    inAlt.style.flex = '1 1 240px';
    const lblAlt = ce('label'); lblAlt.textContent = 'Alt'; lblAlt.style.flex = '1 1 240px'; lblAlt.appendChild(inAlt);
    const upBtn = ce('button', { className: 'btn', textContent: 'Subir otra foto', type: 'button' });
    const fileInp = ce('input', { type: 'file', accept: 'image/*' }); fileInp.style.display = 'none';
    const rowStatus = ce('span', { className: 'status' });
    upBtn.onclick = () => fileInp.click();

    const guardar = async () => {
      if (!currentPath) return;
      rowStatus.textContent = 'Guardando...'; rowStatus.className = 'status';
      try{
        await jput('/pagina_fotos.php', { slug: slot.slug, path: currentPath, alt: inAlt.value.trim() });
        rowStatus.textContent = 'Guardado'; rowStatus.className = 'status ok';
      }catch(e){
        rowStatus.textContent = 'Error: ' + (e?.message || ''); rowStatus.className = 'status err';
      }
    };

    fileInp.onchange = async () => {
      const f = fileInp.files[0]; if (!f) return;
      rowStatus.textContent = 'Subiendo...'; rowStatus.className = 'status';
      const fd = new FormData(); fd.append('archivo', f); fd.append('tipo', 'pagina');
      try{
        const r = await fetch(`${API_BASE}/upload.php`, { method: 'POST', body: fd });
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j?.error || 'Error al subir');
        currentPath = j.ruta;
        img.src = currentPath;
        img.style.visibility = 'visible';
        await guardar();
      }catch(e){
        rowStatus.textContent = 'Error: ' + (e?.message || ''); rowStatus.className = 'status err';
      }
    };

    inAlt.addEventListener('change', guardar);

    row2.appendChild(lblAlt);
    row2.appendChild(upBtn);
    row2.appendChild(fileInp);
    row2.appendChild(rowStatus);
    card.appendChild(row2);

    grid.appendChild(card);
  });
}

function bindFotos(){
  const btn = qs('#btnFotosRefresh'); if (!btn) return;
  btn.addEventListener('click', loadFotos);
}
async function jget(path){
  // Resolver respecto a la URL actual para que funcione en distintos subdirectorios del hosting
  const url = new URL(`${API_BASE}${path}`, location.href);
  url.searchParams.set('_ts', Date.now()); // cache-buster
  const r = await fetch(url.toString(), { cache:'no-store' });
  if(!r.ok) throw new Error('HTTP '+r.status); return r.json();
}
async function jput(path, body){
  const url = new URL(`${API_BASE}${path}`, location.href);
  const r = await fetch(url.toString(), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), cache:'no-store' });
  if(!r.ok){
    let msg = 'HTTP '+r.status;
    try{ const j = await r.json(); if (j && j.error) msg = j.error; }catch(_){ /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

// ---- Nosotros ----
// nosotros.html solo tiene 2 secciones (portada + "El equipo") desde que se
// quitaron la cita editorial y "Cómo trabajamos" (redundante con Servicios).
async function loadAbout(){
  const st = qs('#aboutStatus');
  try{
    const a = await jget('/nosotros.php');
    const setVal = (sel, val) => { const el = qs(sel); if (el) el.value = val || ''; };
    setVal('#aboutHeroTitulo', a.heroTitulo);
    setVal('#aboutHeroBajada', a.heroBajada);
    setVal('#aboutEquipoTitulo', a.equipoTitulo);
    setVal('#aboutEquipoBajada', a.equipoBajada);
    if (st && st.dataset.rol === 'load-error'){ st.textContent = ''; st.className = 'status'; delete st.dataset.rol; }
  }catch(e){
    if (st){ st.textContent = 'No se pudo cargar: ' + (e?.message || 'sin conexión'); st.className = 'status err'; st.dataset.rol = 'load-error'; }
    console.error(e);
  }
}

function bindAbout(){
  const btn = qs('#btnSaveAbout'); if (btn) btn.addEventListener('click', async () => {
    const val = (sel) => qs(sel)?.value.trim() || '';
    const payload = {
      heroTitulo: val('#aboutHeroTitulo'), heroBajada: val('#aboutHeroBajada'),
      equipoTitulo: val('#aboutEquipoTitulo'), equipoBajada: val('#aboutEquipoBajada'),
    };
    const st = qs('#aboutStatus'); if (st){ st.textContent='Guardando...'; st.className='status'; }
    try{
      await jput('/nosotros.php', payload);
      await loadAbout();
      if (st){ st.textContent='Guardado'; st.className='status ok'; }
    }
    catch(e){ if (st){ st.textContent='Error: ' + (e?.message || 'sin conexión'); st.className='status err'; } }
  });
}
// Modal de confirmación (panel UI)
function showConfirm(message, title='Confirmación'){
  const modal = qs('#modalConfirm'); if (!modal){ return Promise.resolve(confirm(message)); }
  const msg = qs('#modalMsg'); const ttl = qs('#modalTitle'); const ok = qs('#modalOk'); const cancel = qs('#modalCancel');
  msg.textContent = message; ttl.textContent = title;
  modal.classList.add('open');
  return new Promise((resolve) => {
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onBackdrop = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };
    function cleanup(){
      modal.classList.remove('open');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e){ if(e.key==='Escape'){ onCancel(); } }
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}
async function jpost(path, body){
  const url = new URL(`${API_BASE}${path}`, location.href);
  const r = await fetch(url.toString(), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), cache:'no-store' });
  if(!r.ok){
    let msg = 'HTTP '+r.status;
    try{ const j = await r.json(); if (j && j.error) msg = j.error; }catch(_){ /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}
async function jdel(path){
  const url = new URL(`${API_BASE}${path}`, location.href);
  const r = await fetch(url.toString(), { method:'DELETE', cache:'no-store' });
  if(!r.ok){
    let msg = 'HTTP '+r.status;
    try{ const j = await r.json(); if (j && j.error) msg = j.error; }catch(_){ /* ignore */ }
    throw new Error(msg);
  }
  return r.json();
}

function setupTabs(){
  const links = document.querySelectorAll('a[data-tab]');
  const activate = (tab, push=true) => {
    links.forEach(a => a.classList.toggle('active', a.dataset.tab===tab));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const sec = qs(`#tab-${tab}`);
    if (sec) sec.classList.add('active');
    if (push){
      const url = new URL(location.href);
      url.searchParams.set('p', tab);
      history.pushState({ tab }, '', url);
    }
    // Al activar Productos, traer el descuento desde la BD y mostrarlo
    if (tab === 'productos'){
      const dc2 = qs('#siteCoreDiscount2');
      const dt2 = qs('#siteCoreDiscountTexto2');
      if (dc2 || dt2){
        jget('/sitio.php').then(s => {
          const val = Number(s?.defaults?.coreDiscount ?? 300);
          if (dc2) dc2.value = isFinite(val) ? val : 300;
          if (dt2) dt2.value = s?.defaults?.coreDiscountTexto || 'entregando tu batería usada';
        }).catch(() => {
          // fallback: intentar copiar del otro input si existe
          const dc1 = qs('#siteCoreDiscount');
          if (dc1 && dc1.value !== '' && dc2) dc2.value = dc1.value;
          const dt1 = qs('#siteCoreDiscountTexto');
          if (dt1 && dt1.value !== '' && dt2) dt2.value = dt1.value;
        });
      }
    }
  };
  // Init from query
  const params = new URLSearchParams(location.search);
  const current = params.get('p') || 'sitio';
  activate(current, false);
  // Bind clicks
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      activate(a.dataset.tab);
    });
  });
  // Handle back/forward
  window.addEventListener('popstate', (ev) => {
    const tab = (new URL(location.href)).searchParams.get('p') || 'sitio';
    activate(tab, false);
  });

  // Mobile hamburger open/close side menu
  const side = qs('.side-nav');
  const btnMenu = qs('#btnMenu');
  const overlay = qs('#menuOverlay');
  const headerControls = qs('#headerControls');
  const drawerControls = qs('#drawerControls');
  const closeMenu = () => { if (side) side.classList.remove('open'); if (overlay) overlay.style.display='none'; };
  const openMenu = () => { 
    if (side) side.classList.add('open'); if (overlay) overlay.style.display='block';
    // mover controles al drawer si existen
    if (headerControls && drawerControls && !drawerControls.contains(headerControls)){
      drawerControls.appendChild(headerControls);
    }
  };
  // al cerrar, devolver controles al header si existen
  overlay && overlay.addEventListener('click', () => {
    if (headerControls && !document.querySelector('.topbar-inner .env') && drawerControls?.contains(headerControls)){
      qs('.topbar-inner')?.appendChild(headerControls);
    }
  });
  if (btnMenu) btnMenu.addEventListener('click', () => {
    if (!side) return; side.classList.contains('open') ? closeMenu() : openMenu();
  });
  if (overlay) overlay.addEventListener('click', closeMenu);
  links.forEach(a => a.addEventListener('click', closeMenu));
}

async function ping(){
  const st = qs('#pingStatus'); st.textContent = 'Probando...';
  try{ const r = await jget('/ping_db.php'); st.textContent = r.ok ? 'OK' : 'Error'; st.className = 'status ' + (r.ok ? 'ok':'err'); }
  catch(e){ st.textContent = 'Error'; st.className = 'status err'; }
}

// ---- Sitio ----
async function loadSite(){
  const st = qs('#siteStatus');
  try{
    const s = await jget('/sitio.php');
    const setVal = (sel, val) => { const el = qs(sel); if (el) el.value = val; };
    setVal('#siteBrandName', s.brandName || '');
    setVal('#siteLogoFile', s.logoFile || '');
    // actualizar preview de logo (solo el del SITIO público, en el editor)
    const prev = qs('#siteLogoPreview'); if (prev){ prev.src = (s.logoFile||'').trim() || ''; }
    // El logo de la barra superior del panel es fijo (nav-logo.png, escrito en
    // el HTML): ya no se pisa con logoFile. Ese campo configura el logo del
    // sitio público, no la marca del propio panel.
    const topBrand = qs('#topBrandName'); if (topBrand) topBrand.textContent = s.brandName || 'CambiaTuBateria';
    setVal('#siteCoreDiscount', (s.defaults?.coreDiscount ?? 300));
    setVal('#siteCoreDiscountTexto', (s.defaults?.coreDiscountTexto ?? 'entregando tu batería usada'));
    // reflejar también en el descuento dentro de Productos si existe
    const dc2 = qs('#siteCoreDiscount2'); if (dc2) dc2.value = (s.defaults?.coreDiscount ?? 300);
    const dt2 = qs('#siteCoreDiscountTexto2'); if (dt2) dt2.value = (s.defaults?.coreDiscountTexto ?? 'entregando tu batería usada');
    // Solo limpio el status si soy YO quien lo escribí (no piso un "Guardando..."
    // del botón que corre en paralelo — ver bindSite).
    if (st && st.dataset.rol === 'load-error'){ st.textContent = ''; st.className = 'status'; delete st.dataset.rol; }
  }catch(e){
    // Fallo del load al abrir la pestaña: hasta hoy solo se veía en el console.
    // Ahora aparece en el status para que el jefe sepa que los campos vacíos
    // no son "no hay nada guardado" sino "no cargó".
    if (st){ st.textContent = 'No se pudo cargar: ' + (e?.message || 'sin conexión'); st.className = 'status err'; st.dataset.rol = 'load-error'; }
    console.error(e);
  }
}

function bindSite(){
  // preview cuando cambie el texto de ruta
  qs('#siteLogoFile').addEventListener('input', (e) => {
    const v = (e.target.value||'').trim();
    qs('#siteLogoPreview').src = v;
  });
  qs('#btnSiteUploadLogo').addEventListener('click', () => qs('#inputSiteLogo').click());
  qs('#inputSiteLogo').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    const fd = new FormData(); fd.append('archivo', f); fd.append('tipo', 'logo'); fd.append('nombre', 'logo_autotraders');
    const st = qs('#siteStatus'); st.textContent = 'Subiendo...';
    try{
      const r = await fetch(`${API_BASE}/upload.php`, { method:'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error||'Upload error');
      qs('#siteLogoFile').value = j.ruta;
      qs('#siteLogoPreview').src = j.ruta;
      st.textContent = 'Logo actualizado'; st.className = 'status ok';
    }catch(err){ st.textContent = 'Error al subir'; st.className = 'status err'; }
  });

  qs('#btnSaveSite').addEventListener('click', async () => {
    const sval = (sel) => (qs(sel)?.value || '').trim();
    const payload = {
      brandName: sval('#siteBrandName'),
      logoFile: sval('#siteLogoFile') || null,
      defaults: {
        coreDiscount: Number(qs('#siteCoreDiscount')?.value) || 300,
        coreDiscountTexto: sval('#siteCoreDiscountTexto') || 'entregando tu batería usada',
      }
    };
    const st = qs('#siteStatus'); st.textContent = 'Guardando...'; st.className = 'status';
    try{
      await jput('/sitio.php', payload);
      await loadSite(); // Re-lee para que los campos reflejen exactamente lo aceptado.
      st.textContent = 'Guardado'; st.className = 'status ok';
    }
    catch(e){ st.textContent = 'Error: ' + (e?.message || 'sin conexión'); st.className = 'status err'; }
  });
}

// ---- Hero ----
// Uno solo, no un carrusel — texto plano, sin fondo (eso lo maneja la
// pestaña Fotos). Reducido a 3 campos: el botón de GPS que tenía cta_texto/
// cta_subtexto se quitó del sitio (WhatsApp 100% el canal).
async function loadHero(){
  const st = qs('#heroStatus');
  try{
    const h = await jget('/hero.php');
    const setVal = (sel, val) => { const el = qs(sel); if (el) el.value = val || ''; };
    setVal('#heroBadge', h.badge);
    setVal('#heroTitulo', h.titulo);
    setVal('#heroBajada', h.bajada);
    if (st && st.dataset.rol === 'load-error'){ st.textContent = ''; st.className = 'status'; delete st.dataset.rol; }
  } catch(e){
    if (st){ st.textContent = 'No se pudo cargar: ' + (e?.message || 'sin conexión'); st.className = 'status err'; st.dataset.rol = 'load-error'; }
    console.error(e);
  }
}
function bindHero(){
  qs('#btnSaveHero').addEventListener('click', async () => {
    const st = qs('#heroStatus');
    st.textContent = 'Guardando...'; st.className = 'status';
    const sval = (sel) => (qs(sel)?.value || '').trim();
    const payload = {
      badge: sval('#heroBadge'),
      titulo: sval('#heroTitulo'),
      bajada: sval('#heroBajada'),
    };
    try{
      await jput('/hero.php', payload);
      await loadHero();
      st.textContent = 'Guardado'; st.className='status ok';
    }
    catch(e){ st.textContent = 'Error: ' + (e?.message || 'sin conexión'); st.className='status err'; }
  });
}

// ---- Cabeceras/bloques de texto (Catálogo, Servicios, Cobertura, Contacto,
// más "Cómo trabajamos" de Servicios y la franja + catálogo de Inicio) ----
// Cada bloque es una fila propia en pagina_cabeceras — el endpoint solo
// admite guardar UNA por PUT, así que "Guardar" dispara una llamada por bloque.
const CABECERAS_PAGINAS = ['catalogo', 'servicios', 'cobertura', 'contacto', 'servicios-trabajo', 'inicio-franja', 'inicio-catalogo'];
// "servicios-trabajo" -> "ServiciosTrabajo", para que el id del campo sea
// #cabServiciosTrabajoTitulo — capitalizar solo la primera letra dejaba el
// guion suelto en el id (id inválido, campo nunca encontrado).
const capCabecera = (s) => s.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

async function loadCabeceras(){
  try{
    const r = await jget('/cabeceras.php');
    const items = r.items || {};
    for (const pagina of CABECERAS_PAGINAS){
      const info = items[pagina] || {};
      const t = qs(`#cab${capCabecera(pagina)}Titulo`); if (t) t.value = info.titulo || '';
      const b = qs(`#cab${capCabecera(pagina)}Bajada`); if (b) b.value = info.bajada || '';
    }
  } catch(e){ console.error(e); }
}
function bindCabeceras(){
  qs('#btnSaveCabeceras').addEventListener('click', async () => {
    const st = qs('#cabecerasStatus');
    st.textContent = 'Guardando...'; st.className = 'status';
    const cap = capCabecera;
    // Guarda página por página, sin cortar el bucle en el primer error: antes
    // un fallo a media guardaba las primeras y dejaba las últimas sin escribir,
    // y el estado mostraba solo "Error" sin decir cuál. Ahora sigue con las
    // demás y al final dice qué se guardó, qué falló y el mensaje real del
    // servidor — así el usuario ve exactamente qué pasó, no un genérico.
    const ok = [];
    const fallos = [];
    for (const pagina of CABECERAS_PAGINAS){
      const titulo = (qs(`#cab${cap(pagina)}Titulo`)?.value || '').trim();
      const bajada = (qs(`#cab${cap(pagina)}Bajada`)?.value || '').trim();
      try {
        await jput('/cabeceras.php', { pagina, titulo, bajada });
        ok.push(cap(pagina));
      } catch (e) {
        fallos.push(`${cap(pagina)}: ${e?.message || 'error desconocido'}`);
      }
    }
    // Re-lee el estado real: si algo quedó grabado, los inputs muestran lo que
    // hay en la BD (no la copia local del formulario, que podría no coincidir
    // con lo que el servidor aceptó).
    await loadCabeceras();
    if (fallos.length === 0) {
      st.textContent = 'Guardado'; st.className = 'status ok';
    } else if (ok.length === 0) {
      st.textContent = 'Error: ' + fallos.join(' · '); st.className = 'status err';
    } else {
      st.textContent = `Guardado: ${ok.join(', ')}. Falló: ${fallos.join(' · ')}`;
      st.className = 'status err';
    }
  });
}

// ---- Cobertura (zonas y distritos, lista abierta) ----
// Antes escrita a mano en cobertura.html, sin ningún campo en el panel — el
// jefe reportó que no podía editar esta información. A diferencia de las
// tarjetas fijas de Nosotros/Servicios, acá el número de zonas es libre:
// mismo patrón de estado en memoria + re-render que waAsesoresRows.
let coberturaZonas = [];

async function loadCobertura(){
  const st = qs('#coberturaStatus');
  try{
    const d = await jget('/cobertura.php');
    const setVal = (sel, val) => { const el = qs(sel); if (el) el.value = val || ''; };
    setVal('#covDistritosTitulo', d.distritosTitulo);
    setVal('#covDistritosBajada', d.distritosBajada);
    setVal('#covHorariosTitulo', d.horariosTitulo);
    setVal('#covHorarioResumenTitulo', d.horarioResumenTitulo);
    setVal('#covHorarioResumenTexto', d.horarioResumenTexto);
    setVal('#covFaqPregunta', d.faqPregunta);
    setVal('#covFaqRespuesta', d.faqRespuesta);
    coberturaZonas = Array.isArray(d.zonas) ? d.zonas.map(z => ({ nombre: z.nombre || '', distritos: Array.isArray(z.distritos) ? z.distritos : [] })) : [];
    renderCoberturaZonas();
    if (st && st.dataset.rol === 'load-error'){ st.textContent = ''; st.className = 'status'; delete st.dataset.rol; }
  }catch(e){
    if (st){ st.textContent = 'No se pudo cargar: ' + (e?.message || 'sin conexión'); st.className = 'status err'; st.dataset.rol = 'load-error'; }
    console.error(e);
  }
}

function renderCoberturaZonas(){
  const grid = qs('#coberturaZonasGrid'); if (!grid) return;
  grid.innerHTML = '';
  coberturaZonas.forEach((zona, idx) => {
    const card = ce('div', { className: 'card' });

    const inNombre = ce('input', { type: 'text', value: zona.nombre || '', placeholder: 'Nombre de la zona' });
    const lblNombre = ce('label'); lblNombre.textContent = 'Zona'; lblNombre.style.display = 'block';
    lblNombre.appendChild(inNombre);

    const inDistritos = ce('textarea', { value: (zona.distritos || []).join('\n'), rows: 5, placeholder: 'Un distrito por línea' });
    const lblDistritos = ce('label'); lblDistritos.textContent = 'Distritos (uno por línea)'; lblDistritos.style.display = 'block'; lblDistritos.style.marginTop = '8px';
    lblDistritos.appendChild(inDistritos);

    card.appendChild(lblNombre);
    card.appendChild(lblDistritos);

    const row = ce('div', { className: 'actions', style: 'margin-top:10px' });
    const del = ce('button', { className: 'btn sm', type: 'button', textContent: 'Quitar zona' });
    del.addEventListener('click', () => {
      coberturaZonas.splice(idx, 1);
      renderCoberturaZonas();
    });
    row.appendChild(del);
    card.appendChild(row);

    // Los inputs escriben directo al estado en memoria — se lee recién al
    // guardar (bindCobertura), no hace falta un listener por tecla.
    inNombre.addEventListener('input', () => { coberturaZonas[idx].nombre = inNombre.value; });
    inDistritos.addEventListener('input', () => { coberturaZonas[idx].distritos = inDistritos.value.split('\n').map(d => d.trim()).filter(Boolean); });

    grid.appendChild(card);
  });
}

function bindCobertura(){
  const btnAdd = qs('#btnAddZona');
  if (btnAdd) btnAdd.addEventListener('click', () => {
    coberturaZonas.push({ nombre: '', distritos: [] });
    renderCoberturaZonas();
  });

  const btn = qs('#btnSaveCobertura'); if (!btn) return;
  btn.addEventListener('click', async () => {
    const st = qs('#coberturaStatus');
    if (st){ st.textContent = 'Guardando...'; st.className = 'status'; }
    const sval = (sel) => (qs(sel)?.value || '').trim();
    const payload = {
      distritosTitulo: sval('#covDistritosTitulo'),
      distritosBajada: sval('#covDistritosBajada'),
      horariosTitulo: sval('#covHorariosTitulo'),
      horarioResumenTitulo: sval('#covHorarioResumenTitulo'),
      horarioResumenTexto: sval('#covHorarioResumenTexto'),
      faqPregunta: sval('#covFaqPregunta'),
      faqRespuesta: sval('#covFaqRespuesta'),
      zonas: coberturaZonas.filter(z => (z.nombre || '').trim() || (z.distritos || []).length),
    };
    try{
      await jput('/cobertura.php', payload);
      await loadCobertura();
      if (st){ st.textContent = 'Guardado'; st.className = 'status ok'; }
    }catch(e){
      if (st){ st.textContent = 'Error: ' + (e?.message || 'sin conexión'); st.className = 'status err'; }
    }
  });
}

// Inyecta CSS para reducir el espacio antes del botón "+ Agregar compatibilidad" en Vehículos asociados
function ensureAssocButtonSpacingStyle(){
  if (document.getElementById('assocBtnSpaceStyle')) return;
  const css = `#tab-asociados #fitList + .row{margin-top:0 !important}#tab-asociados .card > .actions:first-of-type{margin-top:0 !important}`;
  const st = document.createElement('style');
  st.id = 'assocBtnSpaceStyle';
  st.textContent = css;
  document.head.appendChild(st);
  // Además, aplicar inline por si la especificidad del tema lo sobreescribe
  const btnRow = document.querySelector('#fitList + .row');
  if (btnRow) btnRow.style.marginTop = '0px';
  const actions = document.querySelector('#tab-asociados .card > .actions');
  if (actions) actions.style.marginTop = '0px';
}

// ---- Servicios ----
// Slots fijos, uno por cada <article data-servicio-slug="..."> de
// servicios.html — mismo patrón que FOTOS_SLOTS. El ícono de cada card es
// un SVG fijo, no se edita desde acá.
const SERVICIOS_SLOTS = [
  { slug: 'auxilio', label: 'Auxilio a domicilio' },
  { slug: 'instalacion', label: 'Instalación a domicilio' },
  { slug: 'diagnostico', label: 'Diagnóstico de carga' },
  { slug: 'bms', label: 'Reprogramación BMS' },
  { slug: 'reciclaje', label: 'Reciclaje del casco' },
  { slug: 'flotas', label: 'Flotas y empresas' },
];

async function loadServicios(){
  const grid = qs('#serviciosGrid'); if (!grid) return;
  const status = qs('#serviciosStatus');
  if (status){ status.textContent = 'Cargando...'; status.className = 'status'; }
  try{
    const d = await jget('/servicios.php');
    renderServicios(d.items || {});
    if (status){ status.textContent = ''; status.className = 'status'; }
  }catch(e){
    grid.innerHTML = '';
    grid.appendChild(ce('div', { className: 'muted', textContent: 'No se pudieron cargar los servicios' }));
    if (status){ status.textContent = 'Error'; status.className = 'status err'; }
  }
}

function renderServicios(items){
  const grid = qs('#serviciosGrid'); if (!grid) return; grid.innerHTML = '';

  SERVICIOS_SLOTS.forEach((slot) => {
    const actual = items[slot.slug] || null;
    const card = ce('div', { className: 'card' });

    card.appendChild(ce('strong', { textContent: slot.label }));

    const inTitle = ce('input', { type: 'text', value: actual?.title || slot.label });
    const lblTitle = ce('label'); lblTitle.textContent = 'Título'; lblTitle.style.display = 'block'; lblTitle.style.marginTop = '8px';
    lblTitle.appendChild(inTitle);

    const inDesc = ce('textarea', { value: actual?.description || '' });
    const lblDesc = ce('label'); lblDesc.textContent = 'Descripción'; lblDesc.style.display = 'block'; lblDesc.style.marginTop = '8px';
    lblDesc.appendChild(inDesc);

    card.appendChild(lblTitle);
    card.appendChild(lblDesc);

    const row = ce('div', { className: 'actions', style: 'margin-top:10px' });
    const saveBtn = ce('button', { className: 'btn sm', type: 'button', textContent: 'Guardar' });
    const rowStatus = ce('span', { className: 'status' });
    saveBtn.addEventListener('click', async () => {
      rowStatus.textContent = 'Guardando...'; rowStatus.className = 'status';
      try{
        await jput('/servicios.php', { slug: slot.slug, title: inTitle.value.trim(), description: inDesc.value.trim() });
        rowStatus.textContent = 'Guardado'; rowStatus.className = 'status ok';
      }catch(e){
        rowStatus.textContent = 'Error: ' + (e?.message || ''); rowStatus.className = 'status err';
      }
    });
    row.appendChild(saveBtn);
    row.appendChild(rowStatus);
    card.appendChild(row);

    grid.appendChild(card);
  });
}

// ---- Marcas ----
async function loadBrands(){
  const data = await jget('/marcas.php');
  const grid = qs('#brandGrid'); if (!grid) return; grid.innerHTML = '';
  const rows = (data.rows||[]);
  rows.forEach((r, idx) => {
    const card = ce('div', { className:'brand-card', draggable: false });
    const logo = ce('div', { className:'logo' });
    const img = ce('img');
    if (r.logo_path) img.src = r.logo_path; // puede ser ruta absoluta o relativa
    img.alt = r.nombre;
    img.addEventListener('error', () => {
      // Fallback si la imagen no existe: mostrar inicial
      logo.classList.add('noimg');
      logo.textContent = (r.nombre||'?').charAt(0).toUpperCase();
      if (img.parentNode) img.parentNode.removeChild(img);
    });
    logo.appendChild(img);
    const name = ce('div', { className:'name', textContent: r.nombre });

    // Botones
    const up = ce('button', { className:'btn sm', textContent:'↑' });
    const down = ce('button', { className:'btn sm', textContent:'↓' });
    const edit = ce('button', { className:'btn sm', textContent:'Editar imagen' });
    const del = ce('button', { className:'btn danger', textContent:'Eliminar' });
    const fileInp = ce('input', { type:'file', accept:'image/*' });
    fileInp.style.display = 'none';
    edit.addEventListener('click', (e) => { e.stopPropagation(); fileInp.click(); });
    fileInp.addEventListener('change', async () => {
      const f = fileInp.files?.[0]; if (!f) return;
      try{
        // subir logo
        const fd = new FormData(); fd.append('archivo', f); fd.append('tipo','marca'); fd.append('nombre', r.nombre);
        const up = await fetch(`${API_BASE}/upload.php`, { method:'POST', body: fd });
        const ju = await up.json(); if (!up.ok || !ju.success) throw new Error(ju?.error||'Error de subida');
        // asociar logo a la marca (POST actualiza si ya existe)
        await jpost('/marcas.php', { name: r.nombre, logo_path: ju.ruta });
        // refrescar preview sin recargar toda la lista
        if (img) { img.src = ju.ruta; img.style.display=''; logo.classList.remove('noimg'); logo.textContent=''; }
      }catch(e){ alert('No se pudo actualizar el logo: ' + (e?.message||'')); }
    });
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!(await showConfirm(`¿Eliminar la marca "${r.nombre}"?`, 'Eliminar marca'))) return;
      try{
        await jdel(`/marcas.php?name=${encodeURIComponent(r.nombre)}`);
        loadBrands();
      }catch(err){
        const msg = (err?.message||'');
        if (msg.includes('FK_CONSTRAINT') || msg.toLowerCase().includes('productos asociados')){
          const ok = await showConfirm('No se puede eliminar porque tiene productos asociados. ¿Desea borrar la marca y todos los productos asociados?', 'Eliminar marca y productos');
          if (!ok) return;
          try{
            const res = await fetch(`${API_BASE}/marcas.php?name=${encodeURIComponent(r.nombre)}&force=1`, { method:'DELETE' });
            const j = await res.json();
            if (!res.ok){ throw new Error(j?.error||'Error'); }
            loadBrands();
          }catch(e2){ alert('Error al eliminar forzadamente: ' + (e2?.message||'')); }
        } else {
          alert('No se pudo eliminar: ' + msg);
        }
      }
    });
    up.addEventListener('click', () => {
      const i = idx; if (i<=0) return; const tmp = rows[i-1]; rows[i-1]=rows[i]; rows[i]=tmp; render();
    });
    down.addEventListener('click', () => {
      const i = idx; if (i>=rows.length-1) return; const tmp = rows[i+1]; rows[i+1]=rows[i]; rows[i]=tmp; render();
    });
    // Columna de acciones junto al logo
    const actionsCol = ce('div', { className:'brand-actions-col' });
    const rowTop = ce('div', { className:'brand-actions-row' });
    rowTop.appendChild(up); rowTop.appendChild(down); rowTop.appendChild(edit);
    const rowBottom = ce('div', { className:'brand-actions-row' });
    rowBottom.appendChild(del);
    actionsCol.appendChild(rowTop); actionsCol.appendChild(rowBottom);

    // Orden final: logo | acciones | nombre
    card.appendChild(logo); card.appendChild(actionsCol); card.appendChild(name); card.appendChild(fileInp);
    grid.appendChild(card);
  });

  function render(){
    grid.innerHTML='';
    rows.forEach((r, idx) => {
      const card = ce('div', { className:'brand-card', draggable: false });
      const logo = ce('div', { className:'logo' });
      const img = ce('img'); if (r.logo_path) img.src = r.logo_path; img.alt = r.nombre;
      img.addEventListener('error', () => { logo.classList.add('noimg'); logo.textContent = (r.nombre||'?').charAt(0).toUpperCase(); if (img.parentNode) img.parentNode.removeChild(img); });
      logo.appendChild(img);
      const name = ce('div', { className:'name', textContent: r.nombre });
      // Botones
      const up = ce('button', { className:'btn sm', textContent:'↑' });
      const down = ce('button', { className:'btn sm', textContent:'↓' });
      const edit = ce('button', { className:'btn sm', textContent:'Editar imagen' });
      const del = ce('button', { className:'btn danger', textContent:'Eliminar' });
      const fileInp = ce('input', { type:'file', accept:'image/*' }); fileInp.style.display='none';
      edit.addEventListener('click', (e) => { e.stopPropagation(); fileInp.click(); });
      fileInp.addEventListener('change', async () => {
        const f = fileInp.files?.[0]; if (!f) return;
        try{
          const fd = new FormData(); fd.append('archivo', f); fd.append('tipo','marca'); fd.append('nombre', r.nombre);
          const up = await fetch(`${API_BASE}/upload.php`, { method:'POST', body: fd });
          const ju = await up.json(); if (!up.ok || !ju.success) throw new Error(ju?.error||'Error de subida');
          await jpost('/marcas.php', { name: r.nombre, logo_path: ju.ruta });
          if (img) { img.src = ju.ruta; img.style.display=''; logo.classList.remove('noimg'); logo.textContent=''; }
        }catch(e){ alert('No se pudo actualizar el logo: ' + (e?.message||'')); }
      });
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!(await showConfirm(`¿Eliminar la marca "${r.nombre}"?`, 'Eliminar marca'))) return;
        try{
          await jdel(`/marcas.php?name=${encodeURIComponent(r.nombre)}`);
          loadBrands();
        }catch(err){
          const msg = (err?.message||'');
          if (msg.includes('FK_CONSTRAINT') || msg.toLowerCase().includes('productos asociados')){
            const ok = await showConfirm('No se puede eliminar porque tiene productos asociados. ¿Desea borrar la marca y todos los productos asociados?', 'Eliminar marca y productos');
            if (!ok) return;
            try{
              const res = await fetch(`${API_BASE}/marcas.php?name=${encodeURIComponent(r.nombre)}&force=1`, { method:'DELETE' });
              const j = await res.json();
              if (!res.ok){ throw new Error(j?.error||'Error'); }
              loadBrands();
            }catch(e2){ alert('Error al eliminar forzadamente: ' + (e2?.message||'')); }
          } else {
            alert('No se pudo eliminar: ' + msg);
          }
        }
      });
      up.addEventListener('click', () => { const i = idx; if (i<=0) return; const tmp = rows[i-1]; rows[i-1]=rows[i]; rows[i]=tmp; render(); });
      down.addEventListener('click', () => { const i = idx; if (i>=rows.length-1) return; const tmp = rows[i+1]; rows[i+1]=rows[i]; rows[i]=tmp; render(); });
      // Columna de acciones junto al logo
      const actionsCol = ce('div', { className:'brand-actions-col' });
      const rowTop = ce('div', { className:'brand-actions-row' });
      rowTop.appendChild(up); rowTop.appendChild(down); rowTop.appendChild(edit);
      const rowBottom = ce('div', { className:'brand-actions-row' });
      rowBottom.appendChild(del);
      actionsCol.appendChild(rowTop); actionsCol.appendChild(rowBottom);

      card.appendChild(logo); card.appendChild(actionsCol); card.appendChild(name); card.appendChild(fileInp);
      grid.appendChild(card);
    });
  }

  // Crear vehículo en catálogo a partir de la primera fila del editor
  const btnCreateVehicle = qs('#btnCreateVehicle');
  if (btnCreateVehicle){
    btnCreateVehicle.addEventListener('click', async () => {
      const st = qs('#fitStatus'); if (st){ st.textContent='Creando vehículo...'; st.className='status'; }
      const item = fitList?.querySelector('.card.item');
      if (!item){ if (st){ st.textContent='Agrega una compatibilidad primero'; st.className='status err'; } return; }
      const qv = k => (item.querySelector(`[data-k="${k}"]`)?.value || '').trim();
      const payload = {
        brand: qv('brand'), model: qv('model'),
        yearFrom: qv('yearFrom')? Number(qv('yearFrom')): null,
        yearTo: qv('yearTo')? Number(qv('yearTo')): null,
        engine: qv('engine') || null, trim: qv('trim') || null,
      };
      if (!payload.brand || !payload.model){ if (st){ st.textContent='Marca y Modelo son requeridos'; st.className='status err'; } return; }
      try{
        const r = await fetch(`${API_BASE}/vehiculos_asociados.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        const j = await r.json(); if (!r.ok){ throw new Error(j?.error||'Error'); }
        if (st){ st.textContent = j.vehicle?.existed ? 'Ya existía, usando el catálogo' : 'Vehículo creado'; st.className='status ok'; }
        // refrescar lista de vehículos asociados (catálogo)
        loadAssociations();
      }catch(e){ if (st){ st.textContent='Error: ' + (e?.message || 'sin conexión'); st.className='status err'; } }
    });
  }

  // Guardar orden
  const saveBtn = qs('#btnSaveBrandOrder');
  if (saveBtn){
    saveBtn.onclick = async () => {
      const st = qs('#brandOrderStatus'); if (st){ st.textContent = 'Guardando...'; st.className = 'status'; }
      const body = { order: rows.map((r, i) => ({ name: r.nombre, order: i })) };
      try{ await jput('/marcas.php', body); if (st){ st.textContent = 'Orden guardado'; st.className = 'status ok'; } }
      catch(e){ if (st){ st.textContent = 'Error: ' + (e?.message || 'sin conexión'); st.className = 'status err'; } }
    };
  }
}
function bindBrands(){
  qs('#btnAddBrand').addEventListener('click', async () => {
    const name = qs('#brandName').value.trim(); if(!name) return;
    const file = qs('#brandFile').files[0];
    let logo_path = null;
    if (file){
      const fd = new FormData(); fd.append('archivo', file); fd.append('tipo','marca'); fd.append('nombre', name);
      const up = await fetch(`${API_BASE}/upload.php`, { method:'POST', body: fd }); const ju = await up.json(); if (!up.ok || !ju.success) { alert('Error al subir logo'); return; }
      logo_path = ju.ruta;
    }
    await jpost('/marcas.php', { name, logo_path });
    qs('#brandName').value = ''; qs('#brandFile').value = '';
    loadBrands();
  });
}

// ---- Productos (crear básico + listado) ----
async function loadProducts(){
  const grid = qs('#productsGrid'); if (!grid) return; grid.innerHTML = '';
  const brandSel = qs('#listBrand');
  const brand = (brandSel?.value||'') === 'Todas' ? '' : (brandSel?.value||'');
  const q = new URLSearchParams(); if (brand) q.set('brand', brand);
  const data = await jget('/productos.php' + (q.toString()? ('?'+q.toString()):''));

  const products = data.products||[];
  // Agrupar por marca
  const groups = products.reduce((acc, p) => {
    const key = p.brand || 'Sin marca';
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});

  // Ordenar marcas alfabéticamente
  const brands = Object.keys(groups).sort((a,b) => a.localeCompare(b));
  brands.forEach(br => {
    const section = ce('div', { className:'card brand-section' });
    const title = ce('h4', { textContent: br });
    const row = ce('div', { className:'brand-products-row' });
    section.appendChild(title);
    section.appendChild(row);
    (groups[br]||[]).forEach(p => {
      const chip = ce('div', { className:'product-chip' });
      const info = ce('div', { className:'chip-info' });
      info.innerHTML = `<strong>${p.name}</strong><span class="muted">${p.brand||''} • S/ ${(p.price||0).toLocaleString('es-PE')}</span>`;
      const actions = ce('div', { className:'actions' });
      const del = ce('button', { className:'btn danger sm', textContent:'Eliminar' });
      del.addEventListener('click', async () => {
        if (!(await showConfirm('¿Eliminar este producto?', 'Eliminar'))) return;
        try{ await jdel(`/productos.php?id=${p.id}`); loadProducts(); }
        catch(e){ alert('No se pudo eliminar: '+(e?.message||'')); }
      });
      actions.appendChild(del);
      chip.appendChild(info);
      chip.appendChild(actions);
      row.appendChild(chip);
    });
    grid.appendChild(section);
  });
}

function bindList(){
  const sel = qs('#listBrand');
  const btn = qs('#btnListSearch');
  const sel2 = qs('#listBrand2');
  const btn2 = qs('#btnListSearch2');
  // Poblar marcas en el filtro de Listado
  (async () => {
    try{
      const data = await jget('/marcas.php');
      const rows = (data.rows||[]);
      if (sel) sel.innerHTML = ['<option>Todas</option>'].concat(rows.map(r => `<option value="${r.nombre}">${r.nombre}</option>`)).join('');
      if (sel2) sel2.innerHTML = ['<option>Todas</option>'].concat(rows.map(r => `<option value="${r.nombre}">${r.nombre}</option>`)).join('');
    }catch(e){ console.error('No se pudieron cargar marcas para Listado', e); }
    // Cargar listados iniciales si existen los contenedores
    loadProducts();
    loadProducts2();
  })();
  if (sel){ sel.addEventListener('change', loadProducts); }
  if (btn){ btn.addEventListener('click', loadProducts); }
  if (sel2){ sel2.addEventListener('change', loadProducts2); }
  if (btn2){ btn2.addEventListener('click', loadProducts2); }
  const btnRefresh2 = qs('#btnListRefresh2');
  if (btnRefresh2){
    btnRefresh2.addEventListener('click', async () => {
      // Refrescar listado desde el backend
      await loadProducts2();
      // Opcional: asegurar que todo el estado se recargue
      // location.reload(); // descomenta si quieres recargar toda la página
    });
  }
}
function bindProducts(){
  // Fitments UI
  const fitList = qs('#fitList');
  const addFit = qs('#btnAddFit');
  const fitProduct = qs('#fitProduct');
  const btnSaveFit = qs('#btnSaveFit');
  const brandSelect = qs('#prodBrand');
  // Subir el botón "+ Agregar compatibilidad" justo debajo del título
  try{
    const addRow = addFit?.closest('.row');
    const card = addRow?.closest('.card');
    const title = card?.querySelector('h3');
    const actions = card?.querySelector('.actions');
    if (addRow && title && card){
      // Compactar el título al máximo
      title.style.marginBottom = '0px';
      // Si existe la barra de acciones, mover el botón dentro de ella para acercarlo al título
      if (actions && addFit){
        actions.style.justifyContent = 'space-between';
        // Insertar el botón como primer hijo del toolbar
        actions.insertBefore(addFit, actions.firstChild);
        // Eliminar la fila contenedora si quedó vacía
        if (addRow && addRow.children.length === 0){ addRow.remove(); }
      } else {
        // Si no hay toolbar, colocar la fila inmediatamente después del título
        if (title.nextSibling !== addRow){ card.insertBefore(addRow, title.nextSibling); }
        addRow.style.marginTop = '0px';
      }
    }
  }catch(_){ /* no-op */ }
  function renderFitItem(data={}){
    const card = ce('div', { className:'card item' });
    card.innerHTML = `
      <div class="row">
        <label>Marca <input data-k="brand" type="text" value="${data.brand||''}"></label>
        <label>Modelo <input data-k="model" type="text" value="${data.model||''}"></label>
        <label>Año desde <input data-k="yearFrom" type="number" value="${data.yearFrom||''}"></label>
        <label>Año hasta <input data-k="yearTo" type="number" value="${data.yearTo||''}"></label>
      </div>
      <div class="row">
        <button class="btn danger" data-action="remove">Eliminar</button>
      </div>`;
    card.addEventListener('click', (e) => { if (e.target.dataset.action==='remove') card.remove(); });
    return card;
  }
  if (addFit && fitList){ addFit.addEventListener('click', () => fitList.appendChild(renderFitItem())); }

  // Poblar marcas en el desplegable de Productos
  async function populateBrandSelect(){
    if (!brandSelect) return;
    try{
      const data = await jget('/marcas.php');
      const rows = (data.rows||[]);
      brandSelect.innerHTML = rows.map(r => `<option value="${r.nombre}">${r.nombre}</option>`).join('');
    }catch(e){ console.error('No se pudieron cargar marcas', e); }
  }
  populateBrandSelect();

  // Cargar productos al selector (si existe)
  async function populateFitProduct(){
    if (!fitProduct) return;
    try{
      const d = await jget('/productos.php');
      const list = d.products || [];
      fitProduct.innerHTML = '<option value="">Seleccione un producto...</option>' + list.map(p => `<option value="${p.id}">${p.name} (${p.brand||''})</option>`).join('');
    }catch(e){ console.error(e); }
  }
  populateFitProduct();

  // Guardar vehículos (catálogo) desde las filas, sin asociar a producto
  if (btnSaveFit){
    btnSaveFit.addEventListener('click', async () => {
      const st = qs('#fitStatus'); if (st){ st.textContent='Guardando vehículos...'; st.className='status'; }
      const items = [...(fitList?.querySelectorAll('.card.item')||[])];
      if (items.length===0){ if (st){ st.textContent='Agrega al menos un vehículo'; st.className='status err'; } return; }
      try{
        for (const card of items){
          const q = k => (card.querySelector(`[data-k="${k}"]`)?.value || '').trim();
          const payload = {
            brand: q('brand'), model: q('model'),
            yearFrom: q('yearFrom')? Number(q('yearFrom')): null,
            yearTo: q('yearTo')? Number(q('yearTo')): null,
            engine: q('engine') || null,
            trim: q('trim') || null,
          };
          if (!payload.brand || !payload.model) continue;
          const r = await fetch(`${API_BASE}/vehiculos_asociados.php`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
          const j = await r.json(); if (!r.ok){ throw new Error(j?.error||'Error'); }
        }
        if (st){ st.textContent='Guardado'; st.className='status ok'; }
        loadAssociations();
      }catch(e){ if (st){ st.textContent='Error: ' + (e?.message || 'sin conexión'); st.className='status err'; } }
    });
  }

  qs('#btnCreateProduct').addEventListener('click', async () => {
    const get = id => qs(id).value.trim();
    const payload = {
      name: get('#prodName'), brand: get('#prodBrand'),
      price: Number(get('#prodPrice')||0), cca: Number(get('#prodCca')||0), capacity: Number(get('#prodCapacity')||0),
      type: get('#prodType'), dimensions: { length: Number(get('#prodLen')||0), width: Number(get('#prodWid')||0), height: Number(get('#prodHei')||0) },
      weightKg: Number(get('#prodWeight')||0), polarity: get('#prodPolarity'),
      description: get('#prodDesc'),
      images: [],
      fitments: (() => {
        const items = [...(fitList?.querySelectorAll('.card.item')||[])];
        return items.map(card => {
          const q = k => (card.querySelector(`[data-k="${k}"]`)?.value || '').trim();
          const yf = q('yearFrom'), yt = q('yearTo');
          const brand = q('brand'), model = q('model');
          if (!brand && !model) return null;
          return {
            brand,
            model,
            yearFrom: yf? Number(yf): null,
            yearTo: yt? Number(yt): null,
            engine: q('engine') || null,
            trim: q('trim') || null,
          };
        }).filter(Boolean);
      })()
    };
    const st = qs('#prodStatus'); st.textContent = 'Creando...';
    try{
      // subir imágenes si hay
      const files = qs('#prodImages').files; let imgs = [];
      for (const f of files){ const fd = new FormData(); fd.append('archivo', f); fd.append('tipo','producto'); const r = await fetch(`${API_BASE}/upload.php`, { method:'POST', body: fd }); const j = await r.json(); if (r.ok && j.success) imgs.push(j.ruta); }
      payload.images = imgs;
      const res = await jpost('/productos.php', payload);
      // Asociar con vehículos seleccionados (si hay)
      try{
        const newId = res?.id || res?.product?.id || res?.row?.id || res?.data?.id;
        if (newId && PICK_VEH?.selected && PICK_VEH.selected.size){
          for (const vehId of PICK_VEH.selected){
            try{
              const cur = await jget(`/vehiculos_asociados.php?assoc_for=${vehId}`);
              const set = new Set(cur.product_ids||[]); set.add(Number(newId));
              await jput('/vehiculos_asociados.php', { vehiculo_id: Number(vehId), product_ids: [...set] });
            }catch(_){ /* continuar si falla uno */ }
          }
        }
      }catch(_){ /* silencio intencional */ }
      st.textContent = 'Creado'; st.className = 'status ok';
      loadProducts();
    }catch(e){ st.textContent = 'Error: ' + (e?.message || 'sin conexión'); st.className = 'status err'; }
  });
}

// ---- Login helper (siempre redirige a /login) ----
const LOGIN_PATH = '/login';
const LOGIN_URL = new URL(LOGIN_PATH, location.origin).toString();

function goLogin(){
  // evita bucle si ya estás en /login
  if (location.pathname !== LOGIN_PATH){
    location.assign(LOGIN_URL);
  }
}
async function init(){
  // Detectar API_BASE dinámicamente para hosting/subcarpetas
  await detectApiBase();

  // Verificar sesión: si no hay usuario, ir a /login
  (async () => {
    try{
      const me = await jget('/login.php');
      if (!me?.ok){ goLogin(); return; }
      // Control de roles: ocultar sección Usuarios si no es admin
      const role = me?.user?.rol || me?.rol || me?.user?.role || '';
      if (role !== 'admin'){
        const userLink = document.querySelector('a[data-tab="usuario"]'); if (userLink) userLink.parentElement?.removeChild(userLink);
        const userTab = document.getElementById('tab-usuario'); if (userTab) userTab.remove();
        // Si la URL apunta a usuario, redirigir a Branding
        const url = new URL(location.href); if (url.searchParams.get('p') === 'usuario'){
          url.searchParams.set('p', 'branding'); history.replaceState({}, '', url);
        }
      }
    }catch(_){
      goLogin(); return;
    }
  })();

  // Logout
  const lg = qs('#btnLogout');
  if (lg){
    lg.addEventListener('click', async () => {
      try{ await fetch(`${API_BASE}/logout.php`, { method:'POST' }); }catch(_){}
      goLogin();
    });
  }

  // --- El resto de tu init() permanece igual a como lo tienes ---
  // setupTabs();
  // qs('#btnPing').addEventListener('click', ping);
  // loadSite(); bindSite();
  // loadHero(); bindHero();
  // loadServices(); bindServices();

  setupTabs();
  qs('#btnPing').addEventListener('click', ping);

  // Sitio
  loadSite(); bindSite();
  // Hero
  loadHero(); bindHero();
  // Cabeceras de página
  loadCabeceras(); bindCabeceras();
  // Cobertura
  loadCobertura(); bindCobertura();
  // Servicios
  loadServicios();
  // Marcas
  loadBrands(); bindBrands();
  // Productos
  loadProducts(); bindProducts(); bindList();
  bindPickVehicles();
  // Asegurar que el input de descuento en Productos no quede vacío
  setTimeout(() => {
    const dc2 = qs('#siteCoreDiscount2');
    if (dc2 && (dc2.value === '' || dc2.value === undefined || dc2.value === null)){
      const dc1 = qs('#siteCoreDiscount');
      if (dc1 && dc1.value !== '') dc2.value = dc1.value;
    }
  }, 150);
  // Hook para guardar descuento dentro de Productos
  const btnSaveDiscount = qs('#btnSaveDiscount');
  if (btnSaveDiscount){
    btnSaveDiscount.addEventListener('click', async () => {
      const st = qs('#discStatus2'); if (st){ st.textContent='Guardando...'; st.className='status'; }
      const coreDiscount = Number(qs('#siteCoreDiscount2')?.value || 0) || 0;
      const coreDiscountTexto = (qs('#siteCoreDiscountTexto2')?.value || '').trim() || 'entregando tu batería usada';
      try{
        await jput('/sitio.php', { defaults:{ coreDiscount, coreDiscountTexto } });
        // Releer desde la API para mostrar exactamente lo persistido
        let persisted = coreDiscount;
        let persistedTexto = coreDiscountTexto;
        try{
          const s = await jget('/sitio.php');
          persisted = Number(s?.defaults?.coreDiscount ?? coreDiscount);
          persistedTexto = s?.defaults?.coreDiscountTexto ?? coreDiscountTexto;
        }catch(_){ }
        if (st){ st.textContent='Guardado'; st.className='status ok'; }
        const dc1 = qs('#siteCoreDiscount'); if (dc1) dc1.value = persisted;
        const dc2 = qs('#siteCoreDiscount2'); if (dc2) dc2.value = persisted;
        const dt1 = qs('#siteCoreDiscountTexto'); if (dt1) dt1.value = persistedTexto;
        const dt2 = qs('#siteCoreDiscountTexto2'); if (dt2) dt2.value = persistedTexto;
      }catch(e){ if (st){ st.textContent='Error: ' + (e?.message || 'sin conexión'); st.className='status err'; } }
    });
  }
  // Contacto
  loadContact(); bindContact();
  // WhatsApp
  loadWhatsApp(); bindWhatsApp();
  // Asesores de WhatsApp (selector del botón flotante)
  loadAsesores(); bindAsesores();
  // Nosotros
  loadAbout(); bindAbout();
  // Fotos de página
  loadFotos(); bindFotos();
  // Vehículos asociados
  loadAssociations(); bindAssociations();
  // Ajuste de espaciado para "+ Agregar compatibilidad"
  ensureAssocButtonSpacingStyle();
  // Usuarios
  loadUsers(); bindUsers();
}

document.addEventListener('DOMContentLoaded', () => { init(); });

// ---- Contacto (con RUC + labels editables) ----
function _get(id){ return document.querySelector(id); }
function _setVal(id, v){
  const el = _get(id);
  if (!el){ console.warn('[Contacto] Falta input', id); return; }
  el.value = v ?? '';
}
function _getVal(id){
  const el = _get(id);
  return el ? (el.value || '').trim() : '';
}

async function loadContact(){
  try{
    // usa el API_BASE ya configurado: /adminbateria/backend/api
    const c = await jget('/contacto.php');

    // Alias BD/JSON
    const address = c.address ?? c.direccion ?? '';
    const mapUrl  = c.mapUrl  ?? c.map_url   ?? '';
    const phone   = c.phone   ?? c.telefono  ?? '';
    const email   = c.email   ?? '';
    const ruc     = c.ruc     ?? '';

    // Horarios
    const weekdays = (c.schedule?.weekdays) ?? c.horario_weekdays ?? c.scheduleText ?? '';
    const saturday = (c.schedule?.saturday) ?? c.horario_sabado   ?? c.scheduleText ?? '';
    const sunday   = (c.schedule?.sunday)   ?? c.horario_domingo  ?? c.scheduleText ?? '';

    // Labels (títulos editables)
    const labels = c.labels || {};
    const lbAddress  = labels.address  ?? 'Ubicación';
    const lbPhone    = labels.phone    ?? 'Teléfonos';
    const lbEmail    = labels.email    ?? 'Correo';
    const lbRuc      = labels.ruc      ?? 'RUC';
    const lbSchedule = labels.schedule ?? 'Horario';

    // Inputs de valores
    _setVal('#ctAddress',  address);
    _setVal('#ctMapUrl',   mapUrl);
    _setVal('#ctPhone',    phone);
    _setVal('#ctEmail',    email);
    _setVal('#ctRuc',      ruc);
    _setVal('#ctWeekdays', weekdays);
    _setVal('#ctSaturday', saturday);
    _setVal('#ctSunday',   sunday);

    // Inputs de labels
    _setVal('#lbAddress',  lbAddress);
    _setVal('#lbPhone',    lbPhone);
    _setVal('#lbEmail',    lbEmail);
    _setVal('#lbRuc',      lbRuc);
    _setVal('#lbSchedule', lbSchedule);
  }catch(e){
    console.error('[Contacto] No se pudo cargar', e);
  }
}

function bindContact(){
  const btn = _get('#btnSaveContact');
  if (!btn){
    console.warn('[Contacto] Falta botón #btnSaveContact');
    return;
  }
  btn.addEventListener('click', async () => {
    // Valores
    const address   = _getVal('#ctAddress')  || null;
    const mapUrl    = _getVal('#ctMapUrl')   || null;
    const phone     = _getVal('#ctPhone')    || null;
    const email     = _getVal('#ctEmail')    || null;
    const ruc       = _getVal('#ctRuc')      || null;
    const weekdays  = _getVal('#ctWeekdays') || null;
    const saturday  = _getVal('#ctSaturday') || null;
    const sunday    = _getVal('#ctSunday')   || null;

    // Labels
    const lbAddress  = _getVal('#lbAddress')  || 'Ubicación';
    const lbPhone    = _getVal('#lbPhone')    || 'Teléfonos';
    const lbEmail    = _getVal('#lbEmail')    || 'Correo';
    const lbRuc      = _getVal('#lbRuc')      || 'RUC';
    const lbSchedule = _getVal('#lbSchedule') || 'Horario';

    // Payload compatible con el backend nuevo (JSON) y con BD (alias)
    const payload = {
      address, mapUrl, phone, email, ruc,
      schedule: { weekdays, saturday, sunday },
      labels: {
        address: lbAddress, phone: lbPhone, email: lbEmail, ruc: lbRuc, schedule: lbSchedule
      },
      // por compatibilidad con tabla antigua si la usas:
      horario_weekdays: weekdays,
      horario_sabado:   saturday,
      horario_domingo:  sunday
    };

    const st = _get('#contactStatus');
    if (st){ st.textContent = 'Guardando...'; st.className = 'status'; }

    try{
      await jput('/contacto.php', payload);
      await loadContact();
      if (st){ st.textContent = 'Guardado'; st.className = 'status ok'; }
    }catch(e){
      if (st){ st.textContent = 'Error: ' + (e?.message || 'sin conexión'); st.className = 'status err'; }
      console.error('[Contacto] Error al guardar', e);
    }
  });
}



// ---- WhatsApp ----
// Un solo número — el negocio despacha desde una central, no tiene agentes
// por marca de auto (ese esquema era de una demo de otro rubro). Es el mismo
// dato que pagina-fotos.js's equivalent lee pagbateria/backend/api/whatsapp.php
// vía whatsapp-config.js en el sitio público.
async function loadWhatsApp(){
  try{
    const w = await jget('/whatsapp.php');
    qs('#waNumero').value = w.numero || '';
  }catch(e){ console.error(e); }
}

function bindWhatsApp(){
  qs('#btnSaveWhatsApp').addEventListener('click', async () => {
    const st = qs('#waStatus'); st.textContent = 'Guardando...'; st.className = 'status';
    try{
      const r = await jput('/whatsapp.php', { numero: qs('#waNumero').value.trim() });
      qs('#waNumero').value = r.numero || '';
      st.textContent = 'Guardado'; st.className='status ok';
    }catch(e){ st.textContent = 'Error: ' + (e?.message||''); st.className='status err'; }
  });
}

// ---- Asesores de WhatsApp (selector del botón flotante) ----
// Lista nueva y genérica (nombre + rol + número) — NO el viejo roster de
// "agentes por marca de auto" que se quitó en 73a7b44 (esa era una demo de
// otro rubro). Con 2+ activos, el botón flotante público abre un selector;
// con 0 o 1, sigue siendo un link directo.
let waAsesoresRows = [];

async function loadAsesores(){
  try{
    const data = await jget('/whatsapp_asesores.php');
    waAsesoresRows = data.asesores || [];
    renderAsesores();
  }catch(e){ console.error(e); }
}

function renderAsesores(){
  const grid = qs('#waAsesoresGrid'); if (!grid) return; grid.innerHTML = '';
  if (waAsesoresRows.length === 0){
    grid.appendChild(ce('p', { className:'muted', textContent:'Todavía no agregaste ningún asesor.' }));
    return;
  }
  waAsesoresRows.forEach((r, idx) => {
    const card = ce('div', { className:'brand-card' });
    const info = ce('div', { className:'name' });
    info.innerHTML = `<strong>${escHtml(r.nombre)}</strong>${r.rol ? ` — ${escHtml(r.rol)}` : ''}<br><span class="muted">${escHtml(r.numero)}</span>`;

    const up = ce('button', { className:'btn sm', textContent:'↑' });
    const down = ce('button', { className:'btn sm', textContent:'↓' });
    const toggle = ce('button', { className:'btn sm', textContent: r.activo === false ? 'Activar' : 'Desactivar' });
    const del = ce('button', { className:'btn danger', textContent:'Eliminar' });

    up.disabled = idx === 0;
    down.disabled = idx === waAsesoresRows.length - 1;

    up.addEventListener('click', async () => {
      if (idx <= 0) return;
      [waAsesoresRows[idx - 1], waAsesoresRows[idx]] = [waAsesoresRows[idx], waAsesoresRows[idx - 1]];
      await guardarOrdenAsesores();
    });
    down.addEventListener('click', async () => {
      if (idx >= waAsesoresRows.length - 1) return;
      [waAsesoresRows[idx + 1], waAsesoresRows[idx]] = [waAsesoresRows[idx], waAsesoresRows[idx + 1]];
      await guardarOrdenAsesores();
    });
    toggle.addEventListener('click', async () => {
      try{
        await jput('/whatsapp_asesores.php', { id: r.id, nombre: r.nombre, rol: r.rol || '', numero: r.numero, activo: !(r.activo !== false) });
        loadAsesores();
      }catch(e){ alert('No se pudo actualizar: ' + (e?.message || '')); }
    });
    del.addEventListener('click', async () => {
      if (!(await showConfirm(`¿Eliminar a "${r.nombre}" de la lista de asesores?`, 'Eliminar asesor'))) return;
      try{ await jdel(`/whatsapp_asesores.php?id=${r.id}`); loadAsesores(); }
      catch(e){ alert('No se pudo eliminar: ' + (e?.message || '')); }
    });

    const actionsCol = ce('div', { className:'brand-actions-col' });
    const rowTop = ce('div', { className:'brand-actions-row' });
    rowTop.appendChild(up); rowTop.appendChild(down); rowTop.appendChild(toggle);
    const rowBottom = ce('div', { className:'brand-actions-row' });
    rowBottom.appendChild(del);
    actionsCol.appendChild(rowTop); actionsCol.appendChild(rowBottom);

    card.appendChild(actionsCol); card.appendChild(info);
    if (r.activo === false) card.style.opacity = '0.55';
    grid.appendChild(card);
  });
}

async function guardarOrdenAsesores(){
  const order = waAsesoresRows.map((r, i) => ({ id: r.id, orden: i }));
  try{ await jput('/whatsapp_asesores.php', { order }); loadAsesores(); }
  catch(e){ alert('No se pudo reordenar: ' + (e?.message || '')); }
}

/** @param {string} s */
function escHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
}

function bindAsesores(){
  qs('#btnAddAsesor')?.addEventListener('click', async () => {
    const st = qs('#waAsesoresStatus'); st.textContent = 'Guardando...'; st.className = 'status';
    const nombre = (qs('#waAsesorNombre')?.value || '').trim();
    const rol = (qs('#waAsesorRol')?.value || '').trim();
    const numero = (qs('#waAsesorNumero')?.value || '').trim();
    try{
      await jpost('/whatsapp_asesores.php', { nombre, rol, numero });
      qs('#waAsesorNombre').value = ''; qs('#waAsesorRol').value = ''; qs('#waAsesorNumero').value = '';
      st.textContent = 'Agregado'; st.className = 'status ok';
      loadAsesores();
    }catch(e){ st.textContent = 'Error: ' + (e?.message || ''); st.className = 'status err'; }
  });
}
