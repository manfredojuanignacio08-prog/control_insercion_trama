/* Carpeta del Proyecto — Control de Inserción de Trama */

/* ---------- demostración de la grilla ---------- */
const FILAS = 6, COLS = 4;   // columnas = bobinas de selección
let grid = Array.from({length: FILAS}, () => Array(COLS).fill(0));
let tocando = false, timer = null, filaActual = -1;
const $grid = document.getElementById('grid');
const $out  = document.getElementById('out');

function dibujar() {
  if (!$grid) return;
  $grid.style.gridTemplateColumns = `48px repeat(${COLS}, auto)`;
  $grid.innerHTML = '';
  for (let f = 0; f < FILAS; f++) {
    const l = document.createElement('div');
    l.className = 'rl'; l.textContent = `fila ${f + 1}`;
    $grid.appendChild(l);
    for (let c = 0; c < COLS; c++) {
      const cel = document.createElement('div');
      cel.className = 'cel' + (grid[f][c] ? ' on' : '') + (f === filaActual ? ' now' : '');
      cel.textContent = grid[f][c] ? '1' : '';
      // Una sola bobina por fila: marcar otra celda desmarca la anterior.
      cel.onclick = () => { const on = !grid[f][c]; grid[f].fill(0); grid[f][c] = on ? 1 : 0; dibujar(); };
      $grid.appendChild(cel);
    }
  }
}
const activos = f => f.reduce((a, v, i) => (v ? [...a, i + 1] : a), []);

function paso() {
  if (!tocando) return;
  filaActual = (filaActual + 1) % FILAS;
  const a = activos(grid[filaActual]);
  const linea = a.length
    ? `pasada ${filaActual + 1}  →  bobina ${a[0]}`
    : `pasada ${filaActual + 1}  →  ninguna bobina`;
  const prev = $out.textContent.split('\n').slice(-6).join('\n');
  $out.textContent = (prev ? prev + '\n' : '') + linea;
  dibujar();
  timer = setTimeout(paso, 700);
}
function detener() {
  tocando = false; clearTimeout(timer); filaActual = -1;
  const b = document.getElementById('play');
  if (b) b.textContent = '▶ Reproducir';
  dibujar();
}
if ($grid) {
  document.getElementById('play').onclick = () => {
    if (tocando) return detener();
    if (grid.every(f => f.every(v => !v))) {
      $out.textContent = 'La grilla está vacía.\n\nTocá algunas celdas o cargá el ejemplo.';
      return;
    }
    tocando = true;
    document.getElementById('play').textContent = '⏸ Pausar';
    filaActual = -1; $out.textContent = ''; paso();
  };
  document.getElementById('clear').onclick = () => {
    detener();
    grid = Array.from({length: FILAS}, () => Array(COLS).fill(0));
    dibujar(); $out.textContent = 'Grilla vacía.';
  };
  document.getElementById('ejemplo').onclick = () => {
    detener();
    grid = [[1,0,0,0],[0,0,1,0],[0,0,0,1],[0,1,0,0],[1,0,0,0],[0,0,1,0]];
    dibujar();
    $out.textContent = 'Ejemplo cargado: las bobinas 1, 3, 4 y 2 alternadas.\n\nApretá reproducir para verlo en ejecución.';
  };
  dibujar();
}

/* ---------- navegación ---------- */
const enlaces = [...document.querySelectorAll('#nav a')];
const destinos = enlaces.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
function marcar() {
  const y = scrollY + 120;
  let act = null;
  destinos.forEach(d => { if (d.offsetTop <= y) act = d; });
  enlaces.forEach(a => a.classList.toggle('on', act && a.getAttribute('href') === '#' + act.id));
}
addEventListener('scroll', marcar); marcar();

const mt = document.getElementById('mt'), sb = document.getElementById('sb');
if (mt) {
  mt.onclick = () => sb.classList.toggle('open');
  enlaces.forEach(a => a.addEventListener('click', () => sb.classList.remove('open')));
}

/* ---------- comprobación de lectura ---------- */

/* ---------- lightbox de la galería ---------- */
const lb = document.getElementById('lb');
if (lb) {
  const lbimg = document.getElementById('lbimg');
  const lbcap = document.getElementById('lbcap');
  document.querySelectorAll('.gal img').forEach(img => {
    img.addEventListener('click', () => {
      lbimg.src = img.src;
      const cap = img.parentElement.querySelector('figcaption');
      lbcap.textContent = cap ? cap.textContent : '';
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });
  const cerrar = () => { lb.classList.remove('open'); document.body.style.overflow = ''; };
  lb.addEventListener('click', cerrar);
  addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
}

/* ---------- modo oscuro ---------- */
const btnTema = document.getElementById('tema');
if (btnTema) {
  const ico = document.getElementById('tema-ico');
  const txt = document.getElementById('tema-txt');
  const pintar = (t) => {
    document.documentElement.setAttribute('data-tema', t);
    ico.textContent = t === 'oscuro' ? '☀' : '◐';
    txt.textContent = t === 'oscuro' ? 'Modo claro' : 'Modo oscuro';
  };
  // Arranca según lo que prefiera el sistema; el usuario puede cambiarlo.
  const prefiereOscuro = matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  pintar(prefiereOscuro ? 'oscuro' : 'claro');
  btnTema.onclick = () => {
    const actual = document.documentElement.getAttribute('data-tema');
    pintar(actual === 'oscuro' ? 'claro' : 'oscuro');
  };
}

/* ---------- buscador del índice ---------- */
const buscar = document.getElementById('buscar');
if (buscar) {
  const enlacesNav = [...document.querySelectorAll('#nav a')];
  const grupos = [...document.querySelectorAll('#nav .ngr')];
  let sinRes = null;
  buscar.addEventListener('input', () => {
    const q = buscar.value.trim().toLowerCase();
    let visibles = 0;
    enlacesNav.forEach(a => {
      const coincide = !q || a.textContent.toLowerCase().includes(q);
      a.classList.toggle('oculto', !coincide);
      if (coincide) visibles++;
    });
    // Un grupo se oculta si ninguno de sus enlaces quedó visible.
    grupos.forEach(g => {
      let hay = false;
      let el = g.nextElementSibling;
      while (el && !el.classList.contains('ngr')) {
        if (el.tagName === 'A' && !el.classList.contains('oculto')) hay = true;
        el = el.nextElementSibling;
      }
      g.classList.toggle('oculto', !hay);
    });
    if (!sinRes) {
      sinRes = document.createElement('div');
      sinRes.className = 'sin-res';
      sinRes.textContent = 'Sin resultados';
      document.getElementById('nav').appendChild(sinRes);
    }
    sinRes.style.display = (q && visibles === 0) ? 'block' : 'none';
  });
}

/* ---------- grupos del índice, plegables ---------- */
document.querySelectorAll('#nav .ngr').forEach(g => {
  g.addEventListener('click', () => {
    const plegado = g.classList.toggle('plegado');
    let el = g.nextElementSibling;
    while (el && !el.classList.contains('ngr')) {
      if (el.tagName === 'A') el.style.display = plegado ? 'none' : '';
      el = el.nextElementSibling;
    }
  });
});

/* ---------- navegación entre secciones ----------
   La corrección de la cátedra observó que la página se lee de corrido, lo que
   sobrecarga al lector. Se agregan al pie de cada sección dos accesos, al tema
   anterior y al siguiente, para que se pueda avanzar sin volver al índice.   */
(function () {
  const secs = [...document.querySelectorAll('main section[id]')];
  const titulo = s => {
    const h = s.querySelector('h2');
    if (!h) return s.id;
    return h.textContent.replace(/^\s*\d+\s*/, '').trim();
  };
  secs.forEach((s, i) => {
    const nav = document.createElement('nav');
    nav.className = 'navseg';
    nav.setAttribute('aria-label', 'Navegación entre secciones');

    const ant = secs[i - 1];
    const sig = secs[i + 1];

    const link = (dest, clase, etiqueta) => {
      const a = document.createElement('a');
      if (!dest) { a.className = clase + ' vacio'; a.setAttribute('aria-hidden', 'true'); return a; }
      a.href = '#' + dest.id;
      a.className = clase;
      a.innerHTML = `<span class="et">${etiqueta}</span><span class="tt">${titulo(dest)}</span>`;
      return a;
    };
    nav.appendChild(link(ant, 'ant', '← Tema anterior'));
    nav.appendChild(link(sig, 'sig', 'Tema siguiente →'));
    s.appendChild(nav);
  });
})();
