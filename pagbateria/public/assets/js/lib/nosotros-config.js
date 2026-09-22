const BASE = '/pagbateria/backend/api';

export async function aplicarNosotros() {
  const nodos = document.querySelectorAll('[data-nosotros-rol]');
  if (nodos.length === 0) return;

  let datos = null;
  try {
    const r = await fetch(`${BASE}/nosotros.php`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (r.ok) datos = await r.json();
  } catch {
    return;
  }
  if (!datos) return;

  const mapa = {
    'hero-titulo': datos.heroTitulo,
    'hero-bajada': datos.heroBajada,
    'equipo-titulo': datos.equipoTitulo,
    'equipo-bajada': datos.equipoBajada,
  };
  nodos.forEach((nodo) => {
    const rol = nodo.dataset.nosotrosRol;
    const valor = rol ? mapa[rol] : undefined;
    if (valor) nodo.textContent = valor;
  });
}
