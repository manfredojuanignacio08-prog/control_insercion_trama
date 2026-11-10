/* ═══════════ Manuales de uso — Control de Inserción de Trama ═══════════ */

/* ---------- barra de progreso de lectura ---------- */
const prog = document.createElement('div');
prog.className = 'prog';
document.body.appendChild(prog);
addEventListener('scroll', () => {
  const alto = document.body.scrollHeight - innerHeight;
  prog.style.width = alto > 0 ? (scrollY / alto * 100) + '%' : '0';
  btnArriba.classList.toggle('ver', scrollY > 500);
});

/* ---------- cambio entre los dos manuales ---------- */
const tabs = [...document.querySelectorAll('.tab')];
function mostrar(pane) {
  tabs.forEach(t => {
    const act = t.dataset.pane === pane;
    t.classList.toggle('activo', act);
    t.setAttribute('aria-selected', act);
  });
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('oculto', p.dataset.pane !== pane));
  document.querySelectorAll('.nav-pane').forEach(n => n.classList.toggle('oculto', n.dataset.pane !== pane));
  // al cambiar de manual el buscador se limpia, para no dejar el índice filtrado
  if (buscar) { buscar.value = ''; buscar.dispatchEvent(new Event('input')); }
  scrollTo({ top: 0, behavior: 'smooth' });
  history.replaceState(null, '', '#' + pane);
}
tabs.forEach(t => t.addEventListener('click', () => mostrar(t.dataset.pane)));

/* ---------- menú lateral en pantallas chicas ---------- */
const sb = document.getElementById('sb');
const mt = document.getElementById('mt');
if (mt) mt.addEventListener('click', () => sb.classList.toggle('open'));
document.querySelectorAll('#nav a').forEach(a => {
  a.addEventListener('click', () => sb.classList.remove('open'));
});

/* ---------- resaltar la sección visible ---------- */
const secciones = [...document.querySelectorAll('section[id]')];
const enlaces = new Map([...document.querySelectorAll('#nav a')].map(a => [a.getAttribute('href').slice(1), a]));
const obs = new IntersectionObserver(es => {
  es.forEach(e => {
    const a = enlaces.get(e.target.id);
    if (a && e.isIntersecting) {
      document.querySelectorAll('#nav a.activo').forEach(x => x.classList.remove('activo'));
      a.classList.add('activo');
    }
  });
}, { rootMargin: '-15% 0px -70% 0px' });
secciones.forEach(s => obs.observe(s));

/* ---------- modo oscuro ---------- */
const btnTema = document.getElementById('tema');
if (btnTema) {
  const ico = document.getElementById('tema-ico');
  const txt = document.getElementById('tema-txt');
  const pintar = t => {
    document.documentElement.setAttribute('data-tema', t);
    ico.textContent = t === 'oscuro' ? '☀' : '◐';
    txt.textContent = t === 'oscuro' ? 'Modo claro' : 'Modo oscuro';
  };
  pintar(matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
  btnTema.onclick = () => pintar(document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'claro' : 'oscuro');
}

/* ---------- buscador del índice ---------- */
const buscar = document.getElementById('buscar');
if (buscar) {
  let sinRes = null;
  buscar.addEventListener('input', () => {
    const q = buscar.value.trim().toLowerCase();
    const pane = document.querySelector('.nav-pane:not(.oculto)');
    if (!pane) return;
    let visibles = 0;
    pane.querySelectorAll('a').forEach(a => {
      const ok = !q || a.textContent.toLowerCase().includes(q);
      a.classList.toggle('oculto', !ok);
      if (ok) visibles++;
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

/* ---------- ampliar imágenes ---------- */
const lb = document.getElementById('lb');
if (lb) {
  const lbimg = document.getElementById('lbimg');
  const lbcap = document.getElementById('lbcap');
  document.querySelectorAll('figure img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => {
      lbimg.src = img.src;
      const c = img.parentElement.querySelector('figcaption');
      lbcap.textContent = c ? c.textContent : '';
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });
  const cerrar = () => { lb.classList.remove('open'); document.body.style.overflow = ''; };
  lb.addEventListener('click', cerrar);
  addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
}

/* ---------- volver arriba ---------- */
const btnArriba = document.getElementById('arriba');
if (btnArriba) btnArriba.onclick = () => scrollTo({ top: 0, behavior: 'smooth' });

/* ---------- abrir el manual que indique la dirección ---------- */
if (location.hash === '#fab') mostrar('fab');

/* ---------- plegar los puntos principales del índice ---------- */
document.querySelectorAll('.plg').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    const plegado = btn.classList.toggle('plegado');
    const num = btn.dataset.num;
    btn.closest('.nav-pane').querySelectorAll(`a.n1[data-pad="${num}"]`)
      .forEach(a => a.classList.toggle('plegado', plegado));
  });
});
