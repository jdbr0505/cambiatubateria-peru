<?php
// ===== Cargar contacto desde la BD =====
require __DIR__ . '/../backend/lib/db.php';
$pdo = get_pdo();

// Valores por defecto por si faltan campos
$contact = [
  'direccion'         => 'Av. Principal 123, CDMX',
  'map_url'           => 'https://maps.google.com/?q=Av.+Principal+123,Ciudad+de+México',
  'telefono'          => '+52 55 1234 5678',
  'email'             => 'ventas@cambiatubateria.com',
  'ruc'               => '—',
  'horario_weekdays'  => '8:00am a 8:00pm',
  'horario_sabado'    => '8:00am a 8:00pm',
  'horario_domingo'   => '8:00am a 8:00pm',
  'label_address'     => 'Dirección',
  'label_phone'       => 'Teléfono(s)',
  'label_email'       => 'Email',
  // Cambiamos el default de RUC a “Teléfonos” (para el nuevo bloque)
  'label_ruc'         => 'Teléfonos',
  'label_schedule'    => 'Horario',
];

if ($pdo) {
  $row = $pdo->query("SELECT * FROM contact_info WHERE id=1 LIMIT 1")->fetch();
  if ($row) $contact = array_merge($contact, $row);
}

// ===== Teléfonos desde whatsapp_agentes (máx. 3) =====
$agents = [];
if ($pdo) {
  // Si tu tabla tiene un campo 'activo', puedes filtrar: WHERE activo=1
  $sql = "SELECT nombre, telefono FROM whatsapp_agentes ORDER BY id ASC LIMIT 3";
  $agents = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

// Helper para imprimir seguro
function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CambiaTuBatería Perú - Batería a Domicilio en Lima y Callao</title>
  <meta name="description" content="Batería nueva instalada donde estés, en Lima y Callao. Envía tu ubicación con un toque." />

  <!-- Esta es la página ANTERIOR al rediseño, conservada solo como respaldo. El
       sitio real se sirve en la raíz (index.html). Se saca del índice de Google
       y se apunta la autoridad a la raíz para que no compita como duplicado ni
       muestre en el buscador el mensaje viejo ("24/7", "30 minutos"). -->
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="https://cambiatubateriaperu.com/" />

  <!-- (Opcional) Ayuda a evitar caché del HTML en algunos navegadores -->
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- Corregido el salto de línea en 600 -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="./assets/css/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="container header-grid">
      <button class="mobile-menu-button" id="mobileMenuToggle" aria-label="Abrir menú" aria-controls="mobileMenu" aria-expanded="false">
        ☰
      </button>
      <nav class="nav-left"></nav>
      <div class="brand center">
        <img class="brand-logo brand-mini" src="./assets/img/logos/logo_autotraders.png" alt="CambiaTuBateria" />
        <span class="brand-title">CambiaTuBateria</span>
      </div>
      <nav class="nav-right">
        <a class="cart-btn" href="#carrito" aria-label="Carrito">
          <span class="cart-icon">🛒</span>
          <span class="cart-badge">0</span>
        </a>
      </nav>
    </div>
    <div class="mobile-menu" id="mobileMenu" aria-hidden="true"></div>
  </header>

  <main>
    <section id="inicio" class="hero">
      <div class="hero-bg" id="heroBg"></div>
      <div class="container hero-grid">
        <div class="hero-copy">
          <h1>¿Dudas sobre qué batería elegir? <span class="highlight">¡Te asesoramos GRATIS!</span></h1>
          <p>Recomendaciones para Porsche, Ferrari, Range Rover, BMW, Mercedes y más.</p>
          <div class="actions">
            <a class="btn btn-secondary" href="#contacto">Nuestra Ubicación</a>
            <a class="btn btn-success" href="https://wa.me/5255111111111?text=Hola%2C%20necesito%20asesor%C3%ADa%20para%20mi%20veh%C3%ADculo" target="_blank" rel="noopener">Hablar con un asesor</a>
          </div>
        </div>
      </div>
      <button class="hero-arrow left" id="heroPrev" aria-label="Anterior">&#10094;</button>
      <button class="hero-arrow right" id="heroNext" aria-label="Siguiente">&#10095;</button>
      <div class="hero-dots" id="heroDots" aria-label="Controles de hero"></div>
    </section>

    <section id="servicios" class="services">
      <div class="container">
        <h2 class="section-title title-banner">Nuestros Servicios</h2>
        <div class="services-slider">
          <button class="services-arrow left" id="servicesPrev" aria-label="Anterior">&#10094;</button>
          <div class="services-viewport">
            <div class="service-track" id="serviceTrack">
              <article class="card service-card">
                <div class="service-icon red">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M13 2L3 14h6l-1 8 10-12h-6l1-8z" stroke="#ffffff" stroke-width="2" fill="none" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div>
                  <h3>Instalación Rápida</h3>
                  <p>Instalación profesional a domicilio con garantía de servicio.</p>
                </div>
              </article>
              <article class="card service-card">
                <div class="service-icon green">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="#ffffff" stroke-width="2" fill="none"/>
                    <path d="M8 12l2.5 2.5L16 9" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <div>
                  <h3>Garantía Extendida</h3>
                  <p>Hasta 24 meses de garantía en todas nuestras baterías premium.</p>
                </div>
              </article>
              <article class="card service-card">
                <div class="service-icon blue">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V21a1 1 0 01-1 1C10.3 22 2 13.7 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" stroke="#ffffff" stroke-width="2" fill="none"/>
                  </svg>
                </div>
                <div>
                  <h3>Soporte a domicilio</h3>
                  <p>Asistencia técnica para tu emergencia, vamos a donde estés.</p>
                </div>
              </article>
            </div>
          </div>
          <button class="services-arrow right" id="servicesNext" aria-label="Siguiente">&#10095;</button>
        </div>
      </div>
    </section>

    <section id="catalogo" class="catalog">
      <div class="container">
        <h2 class="section-title title-banner">Catálogo de Baterías</h2>
        <div class="catalog-filters">
          <div class="filter-card">
            <div class="filter-title">
              <span class="icon red" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 13.5l-6.5 6.5a2 2 0 01-2.83 0L3 12.33V4h8.33L20 10.17a2 2 0 010 2.83z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/>
                </svg>
              </span> Filtrar por Marca
            </div>
            <div class="filter-body">
              <select id="brandFilter"></select>
            </div>
          </div>
          <div class="filter-card">
            <div class="filter-title">
              <span class="icon blue" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <path d="M11 7v8M7 11h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </span> Buscar por Vehículo
            </div>
            <div class="filter-body vehicle-row">
              <select id="vehicleMake"></select>
              <select id="vehicleModel"></select>
              <select id="vehicleYear"></select>
            </div>
          </div>
        </div>

        <div class="catalog-actions">
          <button id="btnSearch" class="btn btn-danger">Buscar Baterías</button>
          <button id="btnClear" class="btn btn-outline">Limpiar Filtros</button>
          <div class="result-count" id="resultCount"></div>
        </div>

        <div class="products-slider">
          <button class="products-arrow left" id="productsPrev" aria-label="Anterior">&#10094;</button>
          <div class="products-viewport">
            <div id="productsGrid" class="product-track"></div>
          </div>
          <button class="products-arrow right" id="productsNext" aria-label="Siguiente">&#10095;</button>
        </div>
      </div>
    </section>

    <!-- Specialists Section -->
    <section id="especialistas" class="specialists">
      <div class="container">
        <h2 class="section-title title-banner">Especialistas en Vehículos Premium</h2>
        <div class="spec-grid">
          <article class="spec-card">
            <div class="spec-photo" style="background-image:url('./assets/img/carros/bmw.png');"></div>
            <div class="spec-overlay"></div>
            <div class="spec-copy">
              <h3>BMW</h3>
              <p>Baterías premium compatibles con BMW.</p>
            </div>
          </article>
          <article class="spec-card">
            <div class="spec-photo" style="background-image:url('./assets/img/carros/audi.png');"></div>
            <div class="spec-overlay"></div>
            <div class="spec-copy light">
              <h3>Audi</h3>
              <p>Soluciones de batería para Audi.</p>
            </div>
          </article>
          <article class="spec-card">
            <div class="spec-photo" style="background-image:url('./assets/img/carros/ford.png');"></div>
            <div class="spec-overlay"></div>
            <div class="spec-copy light">
              <h3>Ford</h3>
              <p>Baterías confiables para Ford.</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section id="marcas" class="brands">
      <div class="container">
        <h2 class="section-title title-banner">Marcas Premium Exclusivas</h2>
        <div class="brands-slider">
          <button class="brands-arrow left" id="brandsPrev" aria-label="Anterior">&#10094;</button>
          <div class="brands-viewport">
            <ul id="brandsList" class="brand-list"></ul>
          </div>
          <button class="brands-arrow right" id="brandsNext" aria-label="Siguiente">&#10095;</button>
        </div>
      </div>
    </section>

    <!-- ======= Nuestra Ubicación desde BD ======= -->
    <section id="contacto" class="contact">
      <div class="container">
        <h2 class="section-title title-banner">Contacto</h2>
        <div class="location-card">
          <div class="loc-left">
            <div class="loc-item">
              <div class="loc-icon red">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 21s7-6.2 7-11.2A7 7 0 105 9.8C5 14.8 12 21 12 21z" stroke="#ffffff" stroke-width="2" fill="none"/>
                  <circle cx="12" cy="9.8" r="2" fill="#ffffff"/>
                </svg>
              </div>
              <div class="loc-text">
                <div class="loc-label"><?php echo h($contact['label_address']); ?></div>
                <div class="loc-value"><?php echo nl2br(h($contact['direccion'])); ?></div>
                <a class="loc-map" href="<?php echo h($contact['map_url']); ?>" target="_blank" rel="noopener">Ver en mapa</a>
              </div>
            </div>
          </div>
          <div class="loc-right">
            <div class="loc-row">
              <!-- Teléfonos (reemplaza al antiguo RUC) -->
              <div class="loc-item">
                <div class="loc-icon green">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V21a1 1 0 01-1 1C10.3 22 2 13.7 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" stroke="#ffffff" stroke-width="2" fill="none"/>
                  </svg>
                </div>
                <div class="loc-text">
<div class="loc-label"><?php echo h($contact['label_phone'] ?? 'Teléfonos'); ?></div>

                  <div class="loc-value">
                    <?php if (!empty($agents)): ?>
                      <ul style="list-style:none; margin:0; padding:0;">
                        <?php foreach ($agents as $ag): ?>
                          <?php
                            $raw = (string)($ag['telefono'] ?? '');
                            $tel = preg_replace('/\D+/', '', $raw);
                          ?>
                          <li style="margin-bottom:4px">
                            <a href="tel:<?php echo h($tel); ?>"><?php echo h($raw); ?></a>
                            <?php if ($name): ?><small class="muted">· <?php echo h($name); ?></small><?php endif; ?>
                          </li>
                        <?php endforeach; ?>
                      </ul>
                    <?php else: ?>
                      <span class="muted">Sin agentes</span>
                    <?php endif; ?>
                  </div>
                </div>
              </div>

              <div class="loc-item">
                <div class="loc-icon blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" stroke="#ffffff" stroke-width="2" fill="none"/>
                    <path d="M21 7l-9 6L3 7" stroke="#ffffff" stroke-width="2" fill="none"/>
                  </svg>
                </div>
                <div class="loc-text">
                  <div class="loc-label"><?php echo h($contact['label_email']); ?></div>
                  <div class="loc-value"><a href="mailto:<?php echo h($contact['email']); ?>"><?php echo h($contact['email']); ?></a></div>
                </div>
              </div>
            </div>
            <hr class="loc-sep" />
            <div class="loc-row">
              <div class="loc-item">
                <div class="loc-icon orange">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <circle cx="12" cy="13" r="7" stroke="#111111" stroke-width="2" fill="none"/>
                    <path d="M12 10v4l2 1" stroke="#111111" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </div>
                <div class="loc-text">
                  <div class="loc-label"><?php echo h($contact['label_schedule']); ?></div>
                  <div class="loc-value">
                    <?php
                      $lv = trim((string)$contact['horario_weekdays']);
                      $sa = trim((string)$contact['horario_sabado']);
                      $do = trim((string)$contact['horario_domingo']);
                      if ($lv || $sa || $do) {
                        if ($lv) echo '<div>Lunes–Viernes: '.h($lv).'</div>';
                        if ($sa) echo '<div>Sábado: '.h($sa).'</div>';
                        if ($do) echo '<div>Domingo: '.h($do).'</div>';
                      } else {
                        echo '<strong>Atendemos a domicilio</strong>';
                      }
                    ?>
                  </div>
                </div>
              </div>

              <!-- (El bloque de Teléfonos antiguo basado en contact_info.telefono fue retirado a tu solicitud) -->
            </div>
          </div><!-- /loc-right -->
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>Experiencia Premium · Email: <?php echo h($contact['email']); ?> · Teléfono: <?php echo h($contact['telefono']); ?></p>
      <p>© 2025 CambiarTuBateria. Todos los derechos reservados.</p>
    </div>
  </footer>

  <!-- Product Detail Modal -->
  <div id="productModal" class="modal" aria-hidden="true" role="dialog" aria-modal="false">
    <div class="modal-backdrop" id="modalBackdrop"></div>
    <div class="modal-dialog" role="document" aria-labelledby="modalTitle">
      <button class="modal-close" id="modalClose" aria-label="Cerrar">×</button>
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modalTitle"></h3>
        </div>
        <div class="modal-body">
          <div class="modal-col image">
            <img id="modalBrandLogo" alt="Marca" />
          </div>
          <div class="modal-col main">
            <p id="modalDescription" class="muted"></p>
            <div class="modal-price" id="modalPrice"></div>
            <div class="modal-options">
              <div class="option-group">
                <label><input type="radio" name="coreOption" value="return" checked /> Dejar batería</label>
                <label><input type="radio" name="coreOption" value="no_return" /> No dejar batería</label>
              </div>
              <div class="qty-group">
                <span>Cantidad:</span>
                <button type="button" class="qty-btn" id="qtyMinus">−</button>
                <input id="qtyInput" type="number" min="1" value="1" />
                <button type="button" class="qty-btn" id="qtyPlus">+</button>
              </div>
              <button class="btn btn-danger wide" id="btnAddToCart">Agregar al Carrito</button>
            </div>
          </div>
          <div class="modal-col specs">
            <dl class="spec-list">
              <div><dt>Tipo:</dt><dd id="specType">—</dd></div>
              <div><dt>Amperios (Ah):</dt><dd id="specAmps">—</dd></div>
              <div><dt>CCA (-18°C):</dt><dd id="specCca">—</dd></div>
              <div><dt>Largo:</dt><dd id="specLength">—</dd></div>
              <div><dt>Ancho:</dt><dd id="specWidth">—</dd></div>
              <div><dt>Alto:</dt><dd id="specHeight">—</dd></div>
              <div><dt>Peso (kg):</dt><dd id="specWeight">—</dd></div>
              <div><dt>Polaridad:</dt><dd id="specPolarity">—</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Cart Drawer -->
  <aside id="cartDrawer" class="cart-drawer" aria-hidden="true" aria-labelledby="cartTitle">
    <div class="cart-overlay" id="cartOverlay"></div>
    <div class="cart-panel">
      <div class="cart-header">
        <h3 id="cartTitle">Tu Carrito</h3>
        <button id="cartClose" class="cart-close" aria-label="Cerrar">×</button>
      </div>
      <div id="cartItems" class="cart-items"></div>
      <div class="cart-footer">
        <div class="cart-total-row">
          <span>Total</span>
          <strong id="cartTotal">$0</strong>
        </div>
        <a id="cartCheckout" class="btn btn-primary" href="#">Finalizar compra</a>
      </div>
    </div>
  </aside>

  <!-- Call Panel -->
  <div id="callPanel" class="call-panel" aria-hidden="true">
    <div class="call-header">
      <h4>Llamar a un asesor</h4>
      <button id="callClose" class="call-close" aria-label="Cerrar">×</button>
    </div>
    <ul id="callAgents" class="call-agents"></ul>
  </div>

  <!-- WhatsApp Panel -->
  <div id="waPanel" class="wa-panel" aria-hidden="true">
    <div class="wa-header">
      <img
        id="waLogoSmall"
        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
        alt="WhatsApp"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
      <div>
        <div class="wa-title">WhatsApp CambiaTuBateria</div>
        <div class="wa-sub">Atendemos a domicilio</div>
      </div>
      <button id="waClose" class="wa-close" aria-label="Cerrar">×</button>
    </div>
    <div class="wa-body">
      <div class="wa-greet">Hola 👋 ¿En qué podemos ayudarte?</div>
      <ul id="waAgents" class="wa-agents"></ul>
      <div class="wa-quick">Respuestas rápidas · Atención directa</div>
      <div class="wa-input">
        <input id="waMessage" type="text" placeholder="Escribe un mensaje rápido..." />
        <button id="waSend" class="btn btn-primary">Enviar</button>
      </div>
    </div>
  </div>

  <!-- Floating actions -->
  <div class="floating-actions">
    <button class="float-btn whatsapp" id="waToggle" aria-label="WhatsApp">
      <img
        id="waLogo"
        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
        alt="WhatsApp"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
    </button>
    <!-- Cambiado: ahora botón que abre el panel de asesores -->
    <button class="float-btn phone" id="callToggle" aria-label="Llamar">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V21a1 1 0 01-1 1C10.3 22 2 13.7 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z"
              stroke="#EAF2FF" stroke-width="1.5" fill="#ffffff"/>
      </svg>
    </button>
  </div>

  <!-- App JS -->
  <script src="./assets/js/app.js" type="module"></script>

  <!-- Respaldo: si app.js aún no enganchó, este listener abre el panel -->
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      var btn = document.getElementById('callToggle');
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        try {
          if (typeof openCall === 'function') {
            openCall();
          } else {
            var panel = document.getElementById('callPanel');
            if (panel) panel.setAttribute('aria-hidden', 'false');
          }
        } catch (_) {}
      }, { passive: false });
    });
  </script>

  <!-- Cache busting (rompe caché en primera carga por navegador) -->
  <script>
  (function () {
    try {
      if (localStorage.getItem('flushCacheDone') === '1') return;

      // Versión única (marca de tiempo)
      var v = Date.now();

      // Añade ?v=xxxxx a CSS/JS/IMG para romper caché
      var bust = function (el) {
        var attr = el.tagName === 'LINK' ? 'href' : 'src';
        var val = el.getAttribute(attr);
        if (!val) return;
        var url = new URL(val, location.href);
        url.searchParams.set('v', v);
        el.setAttribute(attr, url.pathname + url.search);
      };

      // CSS, JS e imágenes ya presentes en la página
      document.querySelectorAll('link[rel="stylesheet"], script[src], img[src]').forEach(bust);

      // Desregistra service workers (si existieran) para evitar caché agresiva
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); });
      }

      // Marca como hecho y recarga una vez para que cargue todo con el nuevo querystring
      localStorage.setItem('flushCacheDone', '1');
      location.reload();
    } catch (e) { /* silenciar errores */ }
  })();
  </script>
</body>
</html>
